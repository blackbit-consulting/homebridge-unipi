"use strict"

const client = require("./client");

class evok extends client {
	constructor(options) {
		super(options);
		this.on("message", this.parse.bind(this));
	}

	connect() {
		this.get("/rest/all")
			.then((body) => {
				this.deviceList = body;
				super.connect();
			})
			.catch((err) => {
				this.emit("error", err);
			})
	}

	devices() {
		if (typeof this.deviceList === "undefined") {
			throw `Device list not ready`
		}

		return this.deviceList
	}

	device(dev, circuit) {
		return this.devices().filter(device => device.dev === dev && device.circuit === circuit)
	}

	inputs() {
		return this.devices().filter(device => device.dev === "input")
	}

	input(circuit) {
		//TODO: input state?
	}

	relays() {
		return this.devices().filter(device => device.dev === "relay" && device.relay_type === "physical").sort(this.sort);
	}

	relay(circuit, state) {
		let relay = this.relays().find(device => device.circuit === circuit);

		if (!relay) {
			throw `Invalid relay: ${circuit}`;
		}

		if (typeof state === "undefined") {
			return relay.value === 1;
		}

		this.set(relay.dev, relay.circuit, state);
	}

	digitalOutputs() {
		return this
			.devices()
			.filter(device => device.dev === "relay" && device.relay_type === "digital")
			.sort(this.sort);
	}

	digitalOutput(circuit, state) {
		let output = this.digitalOutputs()
			.find(device => device.circuit === circuit);

		if (!output) {
			throw `Invalid digital output: ${circuit}`;
		}

		if (typeof state === "undefined") {
			return output.value === 1;
		}

		this.set(output.dev, output.circuit, state);
	}

	leds() {
		return this
			.devices()
			.filter(device => device.dev === "led")
			.sort(this.sort);
	}

	led(circuit, state) {
		let led = this
			.leds()
			.find(device => device.circuit === circuit);

		if (!led) {
			throw `Invalid LED: ${circuit}`;
		}

		if (typeof state === "undefined") {
			return led.value === 1;
		}

		this.set(led.dev, led.circuit, state);
	}

	analogueInputs() {
		return this
			.devices()
			.filter(device => device.dev === "ai")
			.sort(this.sort);
	}

	analogueInput() {
		//TODO:
	}

	analogueOutputs() {
		return this
			.devices()
			.filter(device => device.dev === "ao")
			.sort(this.sort);
	}

	analogueOutput(circuit, state) {
		let output = this
			.analogueOutputs()
			.find(device => device.circuit === circuit);

		if (!output) {
			throw `Invalid analogue output: ${circuit}`;
		}

		if (typeof state === "undefined") {
			return output.value === 1;
		}

		this.set(output.dev, output.circuit, state);
	}

	owDevices() {
		//TODO:
	}

	set(dev, circuit, state) {
		if (typeof state === "boolean") {
			state = state ? "1" : "0";
		}

		this.send({
			cmd: "set",
			dev: dev,
			circuit: circuit,
			value: state
		});
	}

	parse(message) {
		// handle devices

		//1wire messages are not in an array, so make it an array
		if (!Array.isArray(message)) {
			message = [message];
		}

		message.forEach((device) => {
			let previous = this.device(device.dev, device.circuit);

			// update the state in the device list prior to emitting the event
			this.deviceList[this.deviceList.findIndex(x => x.dev === device.dev && x.circuit === device.circuit)] = device;

			switch (device.dev) {
				case "relay":
					this.emit(device.relay_type === "physical" ? "relay" : "digitalOutput", device, previous);
					break;

				default:
					this.emit(device.dev, device, previous);
			}
		})
	}

	sort(a, b) {
		if (a.circuit < b.circuit) {
			return -1;
		}

		if (a.circuit > b.circuit) {
			return 1;
		}

		return 0;
	}
}

module.exports = evok;
