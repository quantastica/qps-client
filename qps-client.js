var DDP = require("ddp");
var login = require("ddp-login");
var spawn = require("child_process").spawn;
var EJSON = require("ejson");
var QuantumCircuit = require("quantum-circuit");

var shellExec = function(command, toStdin, callback) {
	var args = command.split(" ");
	var cmd = args[0];
	args.shift();

	var result = "";
    var child = spawn(cmd, args);

    if(toStdin) {
		child.stdin.setEncoding("utf-8");
    	child.stdin.write(toStdin);
    	child.stdin.end();
    }

    child.stdout.on("data", function(message) {
    	result += message;
    });

    child.stderr.on("data", function(message) {
    	result += message;
    });

    child.on("error", function(err) {
    	callback(err);
    });

    child.on("close", function(code, signal) {
      if(code == 0) {
      	callback(null, result);
      } else {
      	callback(new Error(result));
      }
    });
};

var parseFixedColTable = function(tableRaw) {
	var tableList = tableRaw.trim().split("\n");

	// Extract column names and indexes
	var cols = [];
	if(tableList.length) {
		var firstRow = tableList[0].trim();

		var colIndexes = [];
		var insideString = false;
		for(var i = 0; i < firstRow.length; i++) {
			if(firstRow[i] == " " && i < firstRow.length - 1 && firstRow[i + 1] == " ") {
				insideString = false;
			} else {
				if(!insideString) {
					colIndexes.push(i);
					insideString = true;
				}
			}
		}

		var lastCol = colIndexes.length - 1;
		for(var i = 0; i < colIndexes.length; i++) {
			var colStart = colIndexes[i];
			var colEnd = i < lastCol ? colIndexes[i + 1] : firstRow.length;
			var name = firstRow.substring(colStart, colEnd).trim().toLowerCase();
			name = name.split(" ").join("_");
			cols.push({
				name: name,
				colStart: colStart,
				colEnd: colEnd
			});
		}

		tableList.shift();
	}

	// Extract data
	var rows = [];
	tableList.map(function(rowRaw) {
		var row = {};
		cols.map(function(col) {
			row[col.name] = rowRaw.substring(col.colStart, col.colEnd).trim();
		});
		rows.push(row);
	});

	return rows;
};

var parseRigettiReservations = function(reservationsRaw) {
	var reservationsList = reservationsRaw.trim().split("\n");
	if(reservationsList.length) {
		reservationsList.shift();
	}
	reservationsRaw = reservationsList.join("\n");

	var reservations = parseFixedColTable(reservationsRaw);

	reservations.map(function(reservation, index) {
		for(var propertyName in reservation) {
			var propertyValue = reservation[propertyName];
			if(propertyName == "price") {
				propertyValue = propertyValue.split("$").join("");
				propertyValue = parseFloat(propertyValue);
			}

			reservations[index][propertyName] = propertyValue;
		}
	});

	return reservations;
};

var parseRigettiLattices = function(latticesRaw) {
	var lattices = [];
	var latticesList = latticesRaw.trim().split("LATTICE");
	latticesList.map(function(latticeRaw) {
		var item = null;
		var latticeList = latticeRaw.trim().split("\n");
		latticeList.map(function(latticeItemRaw) {
			var latticeItemList = latticeItemRaw.trim().split(":");
			if(latticeItemList.length == 2) {
				var propertyName = latticeItemList[0].trim().toLowerCase();
				propertyName = propertyName.split(" ").join("_");
				propertyName = propertyName.split("(").join("");
				propertyName = propertyName.split(".)").join("");

				var propertyValue = latticeItemList[1].trim();
				if(propertyName == "number_of_qubits") {
					propertyValue = parseInt(propertyValue);
				}

				if(propertyName == "qubits") {
					propertyValue = propertyValue.split(",");
					propertyValue.map(function(qubit, qubitIndex) {
						propertyValue[qubitIndex] = parseInt(qubit);
					});
				}

				if(propertyName == "price_per_min") {
					propertyValue = propertyValue.split("$").join("");
					propertyValue = parseFloat(propertyValue);
				}

				if(!item) {
					item = {};
				}
				item[propertyName] = propertyValue;
			}
		});
		if(item) {
			lattices.push(item);
		}
	});


	var devices = {};
	lattices.map(function(lattice) {
		if(!devices[lattice.device]) {
			devices[lattice.device] = { lattices: [] };
		}
		devices[lattice.device].lattices.push(lattice);
	});

	var deviceList = [];
	for(var device in devices) {
		deviceList.push({
			name: device,
			lattices: devices[device].lattices
		});									
	}

	return deviceList;
};

var QPSClient = function(host, port, ssl, account, pass, backends, pythonExecutable) {
	host = host || "";
	port = port || 80;
	ssl = ssl || false;
	account = account || null;
	pass = pass || null;
	backends = backends || [];
	pythonExecutable = pythonExecutable || "python";
	devMode = process.env.DEV_MODE || false;

	var ddpClient = new DDP({
		host: host,
		port: port,
		ssl: ssl
	});

	var token = "";

	ddpClient.connect(function (err, wasReconnect) {
		if(err) {
			console.log(err.message);
			ddpClient.close();
		}

		if(wasReconnect) {
			console.log("Reconected.");
		} else {
			console.log("Connected.");
		}

		ddpClient.on("message", function(msg) {
			var message = EJSON.parse(msg);

			if(message && message.command) {
				switch(message.command) {

					case "run_qvm": {
						var circuit = new QuantumCircuit();
						circuit.load(message.circuit);

						pythonCode = circuit.exportPyquil("", false, null, null, message.lattice, message.asQVM);

						shellExec(pythonExecutable + " -", pythonCode, function(e, r) {
							var output = "";
							if(e) {
								output = e;
							} else {
								output = r;
							}

							updateBackendsOutput("rigetti", output);
						});
					}; break;

				}
			}
		});

		login(ddpClient,
			{  // Options below are the defaults
				 env: "METEOR_TOKEN",	// Name of an environment variable to check for a
										// token. If a token is found and is good,
										// authentication will require no user interaction.
				 method: "account",		// Login method: account, email, username or token
				 account: account,		// Prompt for account info by default
				 pass: pass,			// Prompt for password by default
				 retry: 5,				// Number of login attempts to make
				 plaintext: false		// Do not fallback to plaintext password compatibility
										// for older non-bcrypt accounts
			},
			function(error, userInfo) {
				if(error) {
					// Something went wrong...
					console.log(error.message);
					ddpClient.close();
				} else {
					// We are now logged in, with userInfo.token as our session auth token.
					token = userInfo.token;

					console.log("Login successful.");

					updateBackends();
				}
			}
		);
	});

	var updateBackendsOutput = function(backendType, message) {
		ddpClient.call(
			"updateBackendsOutput",
			[backendType, message],
			function(err, res) {
				if(err) {
					console.log(err);
				}
			},
			function() {
			}
		);
	};

	var updateBackends = function() {
		if(!backends.map) {
			return;
		}

		var backendInfo = {};

		backends.map(function(backend) {
			switch(backend) {
				case "rigetti-qvm": {
					// !!! need to obtain QVM status if possible
					backendInfo.rigettiQvm = {
						status: "OK"
					};
				}; break;

				case "rigetti-qpu": {
					backendInfo.rigettiQpu = {
					};

					if(devMode) {
						backendInfo.rigettiQpu.devices = parseRigettiLattices(_lattices);
						backendInfo.rigettiQpu.reservations = parseRigettiReservations(_reservations);
					} else {
						shellExec("qcs lattices", null, function(e, lattices) {
							if(e) {
								console.log(e);
							} else {
								backendInfo.rigettiQpu.devices = parseRigettiLattices(lattices);

								shellExec("qcs reservations", null, function(e, reservations) {
									if(e) {
										console.log(e);
									} else {
										backendInfo.rigettiQpu.reservations = parseRigettiReservations(reservations);
									}
								});
							}
						});
					}
				}; break;
			}
		});

		ddpClient.call(
			"updateBackends",
			[backendInfo],
			function(err, res) {
				if(err) {
					console.log(err);
				}
			},
			function() {
			}
		);
	};
};

if(typeof module != "undefined" && module.exports) {
	module.exports = QPSClient;
} else {
	this.QPSClient = QPSClient;
}


// output from QCS CLI - used when env DEV_MODE=1

var _reservations = `

UPCOMING COMPUTE BLOCKS
ID    START                    END                      DURATION  LATTICE            PRICE
903   2019-01-11 10:30 CET     2019-01-11 10:45 CET     15.00m    Aspen-1-4Q-B       $70.00
904   2019-01-11 10:45 CET     2019-01-11 11:00 CET     15.00m    Aspen-1-2Q-B       $20.00

`;


var _lattices = `
LATTICE
Name: Aspen-1-2Q-B
  Device: Aspen-1
  Number of qubits: 2
  Qubits: 14,15
  Price (per min.): $1.33


LATTICE
Name: Aspen-1-3Q-B
  Device: Aspen-1
  Number of qubits: 3
  Qubits: 14,15,16
  Price (per min.): $2.50


LATTICE
Name: Aspen-1-4Q-B
  Device: Aspen-1
  Number of qubits: 4
  Qubits: 1,14,15,16
  Price (per min.): $4.67


LATTICE
Name: Aspen-1-5Q-B
  Device: Aspen-1
  Number of qubits: 5
  Qubits: 0,1,14,15,16
  Price (per min.): $6.08


LATTICE
Name: Aspen-1-6Q-B
  Device: Aspen-1
  Number of qubits: 6
  Qubits: 10,11,14,15,16,17
  Price (per min.): $7.50


LATTICE
Name: Aspen-1-7Q-B
  Device: Aspen-1
  Number of qubits: 7
  Qubits: 1,10,11,14,15,16,17
  Price (per min.): $8.92


LATTICE
Name: Aspen-1-8Q-B
  Device: Aspen-1
  Number of qubits: 8
  Qubits: 0,1,10,11,14,15,16,17
  Price (per min.): $10.33


LATTICE
Name: Aspen-1-9Q-B
  Device: Aspen-1
  Number of qubits: 9
  Qubits: 0,1,10,11,13,14,15,16,17
  Price (per min.): $11.75


LATTICE
Name: Aspen-1-16Q-A
  Device: Aspen-1
  Number of qubits: 16
  Qubits: 0,1,2,3,4,5,6,7,10,11,12,13,14,15,16,17
  Price (per min.): $21.67


LATTICE
Name: Aspen-1-2Q-C
  Device: Aspen-1
  Number of qubits: 2
  Qubits: 2,3
  Price (per min.): $1.33


LATTICE
Name: Aspen-1-3Q-C
  Device: Aspen-1
  Number of qubits: 3
  Qubits: 2,3,4
  Price (per min.): $2.50


LATTICE
Name: Aspen-1-4Q-C
  Device: Aspen-1
  Number of qubits: 4
  Qubits: 1,2,3,4
  Price (per min.): $4.67


LATTICE
Name: Aspen-1-5Q-C
  Device: Aspen-1
  Number of qubits: 5
  Qubits: 0,1,2,3,4
  Price (per min.): $6.08


LATTICE
Name: Aspen-1-6Q-C
  Device: Aspen-1
  Number of qubits: 6
  Qubits: 0,1,2,3,4,5
  Price (per min.): $7.50


LATTICE
Name: Aspen-1-7Q-C
  Device: Aspen-1
  Number of qubits: 7
  Qubits: 0,1,2,3,4,5,6
  Price (per min.): $8.92


LATTICE
Name: Aspen-1-8Q-C
  Device: Aspen-1
  Number of qubits: 8
  Qubits: 0,1,2,3,4,5,6,7
  Price (per min.): $10.33


LATTICE
Name: Aspen-1-10Q-C
  Device: Aspen-1
  Number of qubits: 10
  Qubits: 0,1,2,3,4,5,6,7,15,16
  Price (per min.): $13.17


LATTICE
Name: Aspen-1-10Q-B
  Device: Aspen-1
  Number of qubits: 10
  Qubits: 1,2,10,11,12,13,14,15,16,17
  Price (per min.): $13.17
`;
