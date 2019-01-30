QPS Client
==========

QPS Client allows you to use <a href="https://quantum-circuit.com" target="_blank">Quantum Programming Studio</a> UI with  <a href="https://www.rigetti.com/forest" target="_blank">Rigetti Forrest SDK</a>, <a href="https://www.rigetti.com/qcs" target="_blank">Rigetti QCS</a> and <a href="https://qiskit.org/" target="_blank">IBM Qiskit</a>.


## How it works?

QPS Client is running on your local machine (or in the cloud) where your quantum programming environment is installed. It opens secure websocket connection with Quantum Programming Studio server and executes quantum circuits (that you design in the web UI) on your local simulator or on quantum computer.

![Diagram 1](https://raw.githubusercontent.com/perak/qps-client/master/media/qps-client.png)


## Install

1. Make sure you have <a href="https://nodejs.org" target="_blank">node.js</a> and <a href="https://www.npmjs.com/" target="_blank">npm</a> installed on your local machine (it is installed by default in QMI).

2. Run following terminal command:

```
npm install -g qps-client
```


## Usage

### Using with Rigetti Forest SDK installed on your local machine (QVM only)

1. Install <a href="https://www.rigetti.com/forest" target="_blank">Rigetti Forrest SDK</a>

2. Open your terminal and execute following command:

```
qps-client --backends rigetti-qvm
```

### Using with Rigetti QCS (QVM and QPU)

1. Get access to <a href="https://www.rigetti.com/qcs" target="_blank">Rigetti QCS</a> and SSH to your <a href="https://www.rigetti.com/qcs/docs/intro-to-qcs#qmi" target="_blank">QMI</a> (Quantum Machine Image).

2. SSH to your QMI and execute following terminal command:

```
qps-client --backends rigetti-qvm rigetti-qpu
```

When started, qps-client will ask you to enter your <a href="https://quantum-circuit.com" target="_blank">Quantum Programming Studio</a> username and password. When successfully authenticated, you will be able to run circuits on your backend (simulator and/or quantum computer) directly from Quantum Programming Studio UI.

See video:

<a href="http://www.youtube.com/watch?feature=player_embedded&v=tbuvzv4Do6k" target="_blank"><img src="http://img.youtube.com/vi/tbuvzv4Do6k/0.jpg" alt="QPS Client" width="480" height="360" border="10" /></a>


### Using with Qiskit (IBMQ or Aer)

1. Install <a href="https://www.qiskit.com" target="_blank">Qiskit</a>

2. Open your terminal and then:

If you want to use Aer (simulator) provided with Qiskit then run:
```
qps-client --backends qiskit-aer
```

If you want to use IBMQ (remote quantum computer or simulator) then run:
```
qps-client --backends qiskit-ibmq
```

If you want to use both Aer and IBMQ, type:

```
qps-client --backends qiskit-aer qiskit-ibmq
```

When started, qps-client will ask you to enter your <a href="https://quantum-circuit.com" target="_blank">Quantum Programming Studio</a> username and password. When successfully authenticated, you will be able to run circuits on your backend (simulator and/or quantum computer) directly from Quantum Programming Studio UI.


## Project status

Under development / experimental. If you find bugs **please report** here: https://github.com/perak/qps-client/issues

