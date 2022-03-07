var DDP = require("ddp");
var login = require("ddp-login");
var spawn = require("child_process").spawn;
var EJSON = require("ejson");
var fs = require("fs");
var path = require("path");
var envPaths = require("env-paths");
var QuantumCircuit = require("quantum-circuit");

var shellExec = function(command, toStdin, callback) {
	var args = command.split(" ");
	var cmd = args[0];
	var error = null;

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
		error = err;
	});

	child.on("close", function(code, signal) {
		if(code == 0) {
			callback(null, result);
		} else {
			if(!error) {
				error = new Error(result);
			}
			callback(error);
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
	var result = {
		current: [],
		upcoming: []
	};

	var reservationTables = reservationsRaw.trim().split("\n\n");

	reservationTables.map(function(tableRaw) {

		var reservationsList = tableRaw.trim().split("\n");
		if(reservationsList.length) {
			var tableType = reservationsList[0].trim();
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

		switch(tableType) {
			case "CURRENTLY RUNNING COMPUTE BLOCKS": result["current"] = reservations; break;
			case "UPCOMING COMPUTE BLOCKS": result["upcoming"] = reservations; break;
		}
	});

	return result;
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

var updateRigettiReservationInfo = function(info) {
	info.devices.map(function(device) {
		if(device.lattices) {
			device.lattices.map(function(lattice) {
				// Upcoming
				var upcoming = [];
				if(info.reservations && info.reservations.upcoming) {
					upcoming = info.reservations.upcoming.filter(function(reservation) {
						return reservation.lattice == lattice.name;
					});
				}
				if(upcoming.length) {
					lattice.reservation = "upcoming";
				}
				// Current
				var current = [];
				if(info.reservations && info.reservations.current) {
					current = info.reservations.current.filter(function(reservation) {
						return reservation.lattice == lattice.name;
					});
				}
				if(current.length) {
					lattice.reservation = "current";
				}
			});
		}
	});
	return info;
};


var parseQiskitBackends = function(backendsRaw) {
	return (backendsRaw + "").trim().split("\n");
};


var QPSClient = function(host, port, ssl, account, pass, backends, pythonExecutable, toasterExecutable) {
	host = host || "";
	port = port || 80;
	ssl = ssl || false;
	account = account || null;
	pass = pass || null;
	backends = backends || [];
	pythonExecutable = pythonExecutable || "python";
	toasterExecutable = toasterExecutable || "qubit-toaster";

	var devMode = process.env.DEV_MODE || false;
	var tokenEnvVar = "QPS_LOGIN_TOKEN";
	var paths = envPaths("qps-client");
	var configFilename = path.resolve(paths.config, ".qps-config.json");


	var writeConfig = function() {
		var config = {
			token: process.env[tokenEnvVar]
		};

		try {
			if(!fs.existsSync(paths.config)) {
				fs.mkdirSync(paths.config);
			}
		} catch(e) {
			// Failed but not reporting - writing will fail and will be reported.
		}

		try {
			fs.writeFileSync(configFilename, JSON.stringify(config), "utf8");
		} catch(e) {
			console.log("Warning: Error writing configuration file. " + e.message);			
		}
	};

	var readConfig = function() {
		var configRaw = "";
		try {
			if(fs.existsSync(configFilename)) {
				configRaw = fs.readFileSync(configFilename, "utf8");
			}
		} catch(e) {
			console.log("Warning: Error reading configuration file. " + e.message);
		}

		var config = {};
		if(configRaw) {			
			try {
				config = JSON.parse(configRaw);
			} catch(e) {
				console.log("Warning: Error parsing configuration file \"" + configFilename + "\". " + e.message);
			}
		};

		process.env[tokenEnvVar] = config.token ? config.token : "";
	};

	readConfig();

	var ddpClient = new DDP({
		host: host,
		port: port,
		ssl: ssl
	});

	ddpClient.connect(function (err, wasReconnect) {
		if(err) {
			console.log("Unable to connect.", err.message ? err.message : "");
			ddpClient.close();
			return;
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

						var pythonCode = circuit.exportPyquil("", false, null, null, message.lattice, message.asQVM);

						updateBackendsOutput("rigetti", "Running " + circuit.numQubits + " qubit circuit...\n", "busy");

						shellExec(pythonExecutable + " -", pythonCode, function(e, r) {
							var output = "";
							var outputType = "";
							if(e) {
								output = e.message;
								outputType = "error";
							} else {
								output = r;
								outputType = "success";
							}

							updateBackendsOutput("rigetti", output, outputType);
						});
					}; break;

					case "run_qiskit": {
						var circuit = new QuantumCircuit();
						circuit.load(message.circuit);

						var pythonCode = circuit.exportQiskit("", false, null, null, message.provider, message.backend);

						updateBackendsOutput("qiskit", "Running " + circuit.numQubits + " qubit circuit...\n", "busy");

						shellExec(pythonExecutable + " -", pythonCode, function(e, r) {
							var output = "";
							var outputType = "";
							if(e) {
								output = e.message;
								outputType = "error";
							} else {
								output = r;
								outputType = "success";
							}
							updateBackendsOutput("qiskit", output, outputType);
						});
					}; break;

					case "run_toaster": {
						var circuit = new QuantumCircuit();
						circuit.load(message.circuit);

						var toasterCode = JSON.stringify(circuit.exportRaw());

						updateBackendsOutput("qubit-toaster", "Running " + circuit.numQubits + " qubit circuit...\n", "busy");

						shellExec(toasterExecutable + " --shots 1024 -", toasterCode, function(e, r) {
							var output = "";
							var outputType = "";
							if(e) {
								output = e.message;
								outputType = "error";
							} else {
								output = r;
								outputType = "success";
							}
							updateBackendsOutput("qubit-toaster", output, outputType);
						});
					}; break;
				}
			}
		});

		login(ddpClient,
			{  // Options below are the defaults
				 env: tokenEnvVar,		// Name of an environment variable to check for a
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
					process.env[tokenEnvVar] = userInfo.token || "";

					console.log("Login successful.");

					writeConfig();

					updateBackends(backends);
				}
			}
		);
	});

	var updateBackendsOutput = function(backendType, message, messageType) {
		ddpClient.call(
			"updateBackendsOutput",
			[backendType, message, messageType],
			function(err, res) {
				if(err) {
					console.log(err);
				}
			},
			function() {
			}
		);
	};

	var detectBackends = function() {
		var backendList = [];

		var pythonCode = "";

		console.log("Auto detecting backends...");

		// Qubit Toaster
		var toasterExecutable = "qubit-toaster";
		shellExec(toasterExecutable + " -v", null, function(e, result) {
			if(e) {
				// No toaster
			} else {
				// Found toaster
				console.log("Found Qubit Toaster");
				backendList.push("qubit-toaster");
			}

			// Rigetti
			pythonCode = "import pyquil\n";
			shellExec(pythonExecutable + " -", pythonCode, function(e, result) {
				if(e) {
					// No pyquil
				} else {
					// Found pyquil
					console.log("Found pyQuil");
					backendList.push("rigetti-qvm");
					backendList.push("rigetti-qpu");
				}

				// Qiskit
				pythonCode = "import qiskit\n";
				shellExec(pythonExecutable + " -", pythonCode, function(e, result) {
					if(e) {
						// No qiskit
					} else {
						// Found qiskit
						console.log("Found Qiskit");
						backendList.push("qiskit-aer");
						backendList.push("qiskit-ibmq");
					}

					// Cirq
					pythonCode = "import cirq\n";
					shellExec(pythonExecutable + " -", pythonCode, function(e, result) {
						if(e) {
							// No cirq
						} else {
							// Found cirq
							console.log("Found Cirq");
							backendList.push("google-cirq");
						}

						if(backendList.length) {
							if(backendList.indexOf("rigetti-qpu") >= 0) {
								shellExec("qcs", null, function(e, r) {
									if(e) {
										backendList.splice(backendList.indexOf("rigetti-qpu"), 1);
									}
									updateBackends(backendList);
								});
							} else {
								updateBackends(backendList);
							}
						} else {
							console.log("No backends found. Did you activated your virtual environment?");
						}
					});
				});
			});
		});
	};

	var updateBackends = function(backendList) {
		if(!backendList || !backendList.map || !backendList.length) {
			detectBackends();
			return;
		}

		var backendInfo = {};

		console.log("Backends:");
		backendList.map(function(backend) {
			switch(backend) {
				case "qubit-toaster": {
					console.log(backend);

					backendInfo.qubitToaster = {
						status: "OK"
					};

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
				}; break;

				case "qiskit-aer": {
					console.log(backend);

					// !!! implement Aer presence check
					backendInfo.qiskitAer = {
						backends: []
					};

					pythonCode = "";
					pythonCode += "from qiskit import Aer\n";
					pythonCode += "for backend in Aer.backends():\n";
					pythonCode += "    print(backend.name())\n";
					pythonCode += "\n";

					shellExec(pythonExecutable + " -", pythonCode, function(e, bcks) {
						var output = "";
						if(e) {
							console.log(e);
						} else {
							backendInfo.qiskitAer.backends = parseQiskitBackends(bcks);

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
						}
					});

				}; break;

				case "qiskit-ibmq": {
					console.log(backend);

					// !!! implement IBMQ presence check
					backendInfo.qiskitIBMQ = {
						backends: []
					};

					pythonCode = "";
					pythonCode += "from qiskit import IBMQ\n";
					pythonCode += "IBMQ.load_account()\n";
					pythonCode += "provider = IBMQ.get_provider(hub=\"ibm-q\", group=\"open\", project=\"main\")\n";
					pythonCode += "backends = provider.backends(filters=lambda x: x.configuration().n_qubits >= 5)\n";
					pythonCode += "for backend in backends:\n";
					pythonCode += "    print(backend.name())\n";
					pythonCode += "\n";

					shellExec(pythonExecutable + " -", pythonCode, function(e, bcks) {
						var output = "";
						if(e) {
							console.log(e);
						} else {
							backendInfo.qiskitIBMQ.backends = parseQiskitBackends(bcks);

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
						}
					});

				}; break;

				case "rigetti-qvm": {
					console.log(backend);

					// !!! Implement QVM presence check
					backendInfo.rigettiQvm = {
						status: "OK"
					};

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
				}; break;

				case "rigetti-qpu": {
					console.log(backend);

					backendInfo.rigettiQpu = {
					};

					if(devMode) {
						backendInfo.rigettiQpu.devices = parseRigettiLattices(_lattices);
						backendInfo.rigettiQpu.reservations = parseRigettiReservations(_reservations);
						backendInfo.rigettiQpu = updateRigettiReservationInfo(backendInfo.rigettiQpu);

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
					} else {
						shellExec("qcs", null, function(e, r) {
							if(e) {
								console.log("Warning: \"rigetti-qpu\" backend not found. It is available only inside quantum machine image. Error running \"qcs\" CLI:", e.message);
							} else {
								shellExec("qcs lattices", null, function(e, lattices) {
									if(e) {
										console.log("Error reading lattices:", e.message);
									} else {
										backendInfo.rigettiQpu.devices = parseRigettiLattices(lattices);

										shellExec("qcs reservations", null, function(e, reservations) {
											if(e) {
												console.log("Error reading reservations:", e.message);
											} else {
												backendInfo.rigettiQpu.reservations = parseRigettiReservations(reservations);
												backendInfo.rigettiQpu = updateRigettiReservationInfo(backendInfo.rigettiQpu);

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
											}
										});
									}
								});
							}
						});
					}
				}; break;

				case "google-cirq": {
					console.log(backend);

					// Not implemented yet

				}; break;
			}
		});
	};
};

if(typeof module != "undefined" && module.exports) {
	module.exports = QPSClient;
} else {
	this.QPSClient = QPSClient;
}


// output from QCS CLI - used when env DEV_MODE=1

var _reservations = `

CURRENTLY RUNNING COMPUTE BLOCKS
ID    START                    END                      DURATION  LATTICE            PRICE
975   2019-01-16 13:45 CET     2019-01-16 14:00 CET     15.00m    Aspen-1-5Q-C       $20.00

UPCOMING COMPUTE BLOCKS
ID    START                    END                      DURATION  LATTICE            PRICE
976   2019-01-16 18:30 CET     2019-01-16 18:45 CET     15.00m    Aspen-1-2Q-B       $20.00

`;
/*
var _reservations = `
UPCOMING COMPUTE BLOCKS
ID    START                    END                      DURATION  LATTICE            PRICE
903   2019-01-11 10:30 CET     2019-01-11 10:45 CET     15.00m    Aspen-1-4Q-B       $70.00
904   2019-01-11 10:45 CET     2019-01-11 11:00 CET     15.00m    Aspen-1-2Q-B       $20.00
`;
*/

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

// output from running on lattice (bell state at qubits 14 and 15)
/*
{14: array([0, 1, 1, 1]), 15: array([0, 1, 1, 1])}
*/
