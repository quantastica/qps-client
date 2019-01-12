#! /usr/bin/env node

const commandLineArgs = require("command-line-args");
const QPSClient = require("./qps-client");

const optionDefinitions = [
  { name: "host", alias: "h", type: String },
  { name: "port", alias: "p", type: String },
  { name: "ssl", alias: "s", type: Boolean},
  { name: "account", alias: "a", type: String },
  { name: "pass", alias: "l", type: String },
  { name: "backends", alias: "b", type: Array },

  { name: "python_executable", type: String},
  { name: "help", type: Boolean}
];

console.log("");
console.log("Quantum Programming Studio Client");

var printUsage = function() {
	console.log("");
	console.log("Usage:");
	console.log("\tqps-client [-h host] [-p port] [-s] [-a account] [-l password]");
	console.log("\t\t-h, --host\tHost");
	console.log("\t\t-p, --port\tPort");
	console.log("\t\t-s, --ssl\tSSL");
	console.log("\t\t-a, --account\tAccount name (username or email)");
	console.log("\t\t-l, --pass\tAccount password");
	console.log("\t\t--help\tPrint help");
	console.log("");
};

// Process command line arguments

const args = commandLineArgs(optionDefinitions);

if(args.help) {
	printUsage();
	process.exit(1);
}

if(!args.host) {
	args.host = "quantum-circuit.com";
}

if(!args.port) {
	args.port = "443";
}

args.port = parseInt(args.port);
if(isNaN(args.port) || !args.port) {
	args.port = 443;
}

if(args.port == 443) {
	args.ssl = true;
}

if(!args.python_executable) {
	args.python_executable = "python";
}

// ---
// !!! temporary fixed to Rigetti
// ---
args.backends = [
	"rigetti-qvm",
	"rigetti-qpu"
];
// ---

// Connect

QPSClient(args.host, args.port, args.ssl, args.account, args.pass, args.backends, args.python_executable);
