"use strict";

const Rx = require("rxjs");
const filter = require("rxjs/operators").filter;

const Evok = require("unipi-evok");

/**
 * This class represents a single UniPi Accessory. It acts as a gateway for retrieving information from the device,
 * and for sending commands to the device. This class represents the Accessory in HomeBridge.
 */
module.exports.UniPiAccessory = class UniPiAccessory {

	/**
	 * Construct a new UniPi accessory
	 * @param homebridge {object} A reference to the running HomeBridge instance.
	 * @param platform {UniPiPlatform} The UniPi platform instance
	 * @param accessory {Accessory} The UniPi HomeBridge accessory object
	 */
	constructor(platform, config, accessory) {
		this.$platform = platform;
		if (accessory) {
			this.$config = accessory.context;
			this.$accessory = accessory;
		} else {
			this.$config = config;
			this.$uuid = UniPiAccessory.UUID.generate(`${this.$config.host}:${this.$config.port}`);
			this.$accessory = new UniPiAccessory.$homebridge.platformAccessory(this.$config.name, this.$uuid);
			this.$accessory.context = this.$config;
			this.$accessory
				.getService(UniPiAccessory.Service.AccessoryInformation)
				.setCharacteristic(UniPiAccessory.Characteristic.Manufacturer, "UniPi.technology")
				.setCharacteristic(UniPiAccessory.Characteristic.Model, "Neuron <Pending>")
				.setCharacteristic(UniPiAccessory.Characteristic.SerialNumber, "Pending")
				.setCharacteristic(UniPiAccessory.Characteristic.FirmwareRevision, "Pending");
		}

		this.$accessory.on("identify", (paired, next) => this.identify(paired, next));
	}

	$setupDigitalOutputs() {
		try {
			this.$digitalOutputs = new Map();
			let digitalOutputs = this.$device.digitalOutputs();
			digitalOutputs.forEach((digOutEvent) => {
				let {s, i} = {
					s: parseInt(digOutEvent.circuit.substr(0, 1)),
					i: parseInt(digOutEvent.circuit.substr(2))
				};
				let digOut = this.$accessory
					.getServiceByUUIDAndSubType(UniPiAccessory.Service.Switch, `digital-output-${s}.${i}`);
				if (!digOut) {
					digOut = new UniPiAccessory.Service.Switch(`Digital Output ${s}.${i}`, `digital-output-${s}.${i}`);
					digOut
						.setCharacteristic(UniPiAccessory.Characteristic.Manufacturer, "UniPi.technology")
						.setCharacteristic(UniPiAccessory.Characteristic.Model, "Neuron M203")
						.setCharacteristic(UniPiAccessory.Characteristic.SerialNumber, "140")
						.setCharacteristic(UniPiAccessory.Characteristic.FirmwareRevision, "Unknown")
						.setCharacteristic(UniPiAccessory.Characteristic.Name, `Digital Output ${s}.${i}`)
						.getCharacteristic(UniPiAccessory.Characteristic.On);
					this.accessory.addService(digOut);
				}
				digOut
					.getCharacteristic(UniPiAccessory.Characteristic.On)
					.on("get", (done) => this.getDigitalOutputState(digOutEvent.circuit, done))
					.on("set", (state, done) => this.setDigitalOutputState(digOutEvent.circuit, state, done));
				this.$digitalOutputs.set(`digital-output-${s}.${i}`, digOut);
			});
		} catch (error) {
			console.error(error, error.stack);
		}
	}

	$setupRelayOutputs() {
		try {
			this.$relayOutputs = new Map();
			let relays = this.$device.relays();
			relays.forEach((relayEvent) => {
				let {s, i} = {
					s: parseInt(relayEvent.circuit.substr(0, 1)),
					i: parseInt(relayEvent.circuit.substr(2))
				};
				let relay = this.$accessory
					.getServiceByUUIDAndSubType(UniPiAccessory.Service.Switch, `relay-${s}.${i}`);
				if (!relay) {
					relay = new UniPiAccessory.Service.Switch(`Relay ${s}.${i}`, `relay-${s}.${i}`);
					relay
						.setCharacteristic(UniPiAccessory.Characteristic.Manufacturer, "UniPi.technology")
						.setCharacteristic(UniPiAccessory.Characteristic.Model, "Neuron M203")
						.setCharacteristic(UniPiAccessory.Characteristic.SerialNumber, "140")
						.setCharacteristic(UniPiAccessory.Characteristic.FirmwareRevision, "Unknown")
						.setCharacteristic(UniPiAccessory.Characteristic.Name, `Relay ${s}.${i}`)
						.getCharacteristic(UniPiAccessory.Characteristic.On);
					this.accessory.addService(relay);
				}
				relay
					.getCharacteristic(UniPiAccessory.Characteristic.On)
					.on("get", (done) => this.getRelayOutputState(relayEvent.circuit, done))
					.on("set", (state, done) => this.setRelayOutputState(relayEvent.circuit, state, done));
				this.$relayOutputs.set(`relay-${s}.${i}`, relay);
			});
		} catch (error) {
			console.error(error, error.stack);
		}
	}

	$setupDigitalInputs() {
		try {
			this.$digitalInputs = new Map();
			this.$digitalInputStates = new Map();
			let digitalInputs = this.$device.inputs();
			let l = 0;
			digitalInputs.forEach((inputEvent) => {
				let {s, i} = {
					s: parseInt(inputEvent.circuit.substr(0, 1)),
					i: parseInt(inputEvent.circuit.substr(2))
				};
				l++;
				let digIn = this.$accessory
					.getServiceByUUIDAndSubType(UniPiAccessory.Service.StatelessProgrammableSwitch, `digital-input-${s}.${i}`);
				if (!digIn) {
					digIn = new UniPiAccessory.Service.StatelessProgrammableSwitch(`Digital Input ${s}.${i}`, `digital-input-${s}.${i}`)
					digIn
						.setCharacteristic(UniPiAccessory.Characteristic.Manufacturer, "UniPi.technology")
						.setCharacteristic(UniPiAccessory.Characteristic.Model, "Neuron M203")
						.setCharacteristic(UniPiAccessory.Characteristic.SerialNumber, "140")
						.setCharacteristic(UniPiAccessory.Characteristic.FirmwareRevision, "Unknown")
						.setCharacteristic(UniPiAccessory.Characteristic.Name, `Digital Input ${s}.${i}`);
					digIn
						.getCharacteristic(UniPiAccessory.Characteristic.ProgrammableSwitchEvent)
						.setProps({
							minValue: UniPiAccessory.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
							maxValue: UniPiAccessory.Characteristic.ProgrammableSwitchEvent.LONG_PRESS
						});
					digIn
						.getCharacteristic(UniPiAccessory.Characteristic.ServiceLabelIndex)
						.setValue(l);
					this.accessory.addService(digIn);
				} else {
					digIn
						.getCharacteristic(UniPiAccessory.Characteristic.ProgrammableSwitchEvent)
						.setProps({
							minValue: UniPiAccessory.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
							maxValue: UniPiAccessory.Characteristic.ProgrammableSwitchEvent.LONG_PRESS
						});
					digIn
						.getCharacteristic(UniPiAccessory.Characteristic.ServiceLabelIndex)
						.setValue(l);
				}

				this.$digitalInputs.set(`digital-input-${s}.${i}`, digIn);
				// TODO : Setup input debounce to a value between 5 and 10. Not possible via unipi-evok lib now.
				this.$digitalInputStates.set(`digital-input-${s}.${i}`, {
					down: false,
					downTime: null,
					upTime: null,
					cancelTimer: null
				});
			});
		} catch (error) {
			console.error(error, error.stack);
		}
	}

	processOnOffEvent(event) {
		// console.log("Processing relay event %j", event);
		let {s, i} = {s: parseInt(event.circuit.substr(0, 1)), i: parseInt(event.circuit.substr(2))};
		let device = null;
		if (event.dev === "relay" && event.relay_type === "digital") {
			const digOutId = `digital-output-${s}.${i}`;
			device = this.$digitalOutputs.get(digOutId);
		} else if (event.dev === "relay" && event.relay_type === "physical") {
			const relayId = `relay-${s}.${i}`;
			device = this.$relayOutputs.get(relayId);
		} else if (event.dev === "led") {
			const ledId = `user-led-${s}.${i}`;
			device = this.$userLeds.get(ledId);
		}
		if (device) {
			device
				.getCharacteristic(UniPiAccessory.Characteristic.On)
				.updateValue(event.value && true || false);
		}
	}

	processDigitalInputEvent(event) {
		// console.log("Processing digital input event %j", event);
		let {s, i} = {s: parseInt(event.circuit.substr(0, 1)), i: parseInt(event.circuit.substr(2))};
		const digInId = `digital-input-${s}.${i}`;
		let digIn = this.$digitalInputs.get(digInId);
		let state = this.$digitalInputStates.get(digInId);
		if (digIn) {
			if (event.value === 1) {
				this.log("Digital input " + digInId + " DOWN");
				state.down = true;
				state.downTime = Date.now();
			}
			if (event.value === 0) {
				this.log("Digital input " + digInId + " UP");
				let wasDown = state.down;
				state.down = false;
				state.upTime = Date.now();
				let delay = state.upTime - state.downTime;
				if (wasDown) {
					if (state.cancelTimer) { // DOUBLE CLICK
						clearTimeout(state.cancelTimer);
						state.cancelTimer = null;
						this.log("Raising DOUBLE PRESS event for digital input " + digInId);
						digIn
							.getCharacteristic(UniPiAccessory.Characteristic.ProgrammableSwitchEvent)
							.updateValue(UniPiAccessory.Characteristic.ProgrammableSwitchEvent.DOUBLE_PRESS);
					} else if (delay > 1000) {
						this.log("Raising LONG PRESS event for digital input " + digInId);
						digIn
							.getCharacteristic(UniPiAccessory.Characteristic.ProgrammableSwitchEvent)
							.updateValue(UniPiAccessory.Characteristic.ProgrammableSwitchEvent.LONG_PRESS);
					} else {
						this.log("Scheduling SINGLE PRESS event for digital input " + digInId + " in 350 ms");
						state.cancelTimer = setTimeout(() => {
							state.cancelTimer = null;
							this.log("Raising SINGLE PRESS event for digital input " + digInId);
							digIn
								.getCharacteristic(UniPiAccessory.Characteristic.ProgrammableSwitchEvent)
								.updateValue(UniPiAccessory.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);
						}, 350);
					}
				}
			}
		}
	}

	start() {
		this.$device = new Evok({
			host: this.$config.host,
			restPort: this.$config.port,
			wsPort: this.$config.wsPort
		});

		this.$eventStream = new Rx.Subject();

		this.$eventStream
			.subscribe((event) => {
				// this.log(event);
				switch (event.dev) {
					case "neuron":
						this.$accessory
							.getService(UniPiAccessory.Service.AccessoryInformation)
							.setCharacteristic(UniPiAccessory.Characteristic.Manufacturer, "UniPi.technology")
							.setCharacteristic(UniPiAccessory.Characteristic.Model, `Neuron ${event.model}`)
							.setCharacteristic(UniPiAccessory.Characteristic.SerialNumber, `${event.sn}`)
							.setCharacteristic(UniPiAccessory.Characteristic.FirmwareRevision, event.ver2);
						break;
					case "input":
						this.processDigitalInputEvent(event);
						break;
					case "relay":
					case "led":
						this.processOnOffEvent(event);
						break;
				}
			});

		this.$device
			.on("connected", () => {
				this.$accessory.updateReachability(true);
				this.$eventStream.next({dev: "unipi", value: 1});
				this.$setupDigitalOutputs();
				this.$setupRelayOutputs();
				this.$setupDigitalInputs();
				this.$setupUserLeds();
				// Set initial states
				this.$device.devices().forEach((device) => {
					this.$eventStream.next(device);
				});
			})
			.on("error", (error) => {
				console.error(error, error.stack);
				this.$accessory.updateReachability(false);
				this.reconnect();
			})
			.on("message", (device, previous = {}) => {
				device.forEach((message) => this.$eventStream.next(message));
			});
		this.reconnect();
	}

	reconnect() {
		try {
			this.$device.connect();
		} catch (error) {
			log("Problem connecting to UniPi device. Reconnecting in 10s...");
			setTimeout(() => {
				this.reconnect();
			}, 10000);
		}
	}

	stop() {
		this.$device.close();
		this.$accessory.updateReachability(true);
	}

	get accessory() {
		return this.$accessory;
	}

	get uuid() {
		return this.$accessory.uuid;
	}

	get device() {
		return this.$device;
	}

	/**
	 * Sets the state of a digital output (not async).
	 *
	 * @param circuit {string} The circuit to set the state of
	 * @param state {boolean} new state
	 * @param done Callback
	 */
	setDigitalOutputState(circuit, state, done) {
		try {
			// this.log("Setting Digital Output " + circuit + " to " + state);
			let value = this.$device.digitalOutput(circuit, state && true || false);
			done(null, value);
		} catch (error) {
			console.error(error, error.stack);
			done(error);
		}
	}

	getDigitalOutputState(circuit, done) {
		try {
			// this.log("Reading Digital Output " + circuit);
			let value = this.$device.digitalOutput(circuit);
			done(null, value);
		} catch (error) {
			console.error(error, error.stack);
			done(error);
		}
	}

	/**
	 * Sets the state of a digital output (not async).
	 *
	 * @param circuit {string} The circuit to set the state of
	 * @param state {boolean} new state
	 * @param done Callback
	 */
	setRelayOutputState(circuit, state, done) {
		try {
			// this.log("Setting Relay Output " + circuit + " to " + state);
			let value = this.$device.relay(circuit, state && true || false);
			done(null, value);
		} catch (error) {
			console.error(error, error.stack);
			done(error);
		}
	}

	getRelayOutputState(circuit, done) {
		try {
			// this.log("Reading Relay Output " + circuit);
			let value = this.$device.relay(circuit);
			done(null, value);
		} catch (error) {
			console.error(error, error.stack);
			done(error);
		}
	}

	setUserLedState(circuit, state, done) {
		try {
			// this.log("Setting User Led " + circuit + " to " + state);
			let value = this.$device.led(circuit, state && true || false);
			done(null, value);
		} catch (error) {
			console.error(error, error.stack);
			done(error);
		}
	}

	getUserLedState(circuit, done) {
		try {
			// this.log("Reading User Led " + circuit);
			let value = this.$device.led(circuit);
			done(null, value);
		} catch (error) {
			console.error(error, error.stack);
			done(error);
		}
	}

	$setupUserLeds() {
		try {
			this.$userLeds = new Map();
			let leds = this.$device.leds();
			leds.forEach((ledEvent) => {
				let {s, i} = {s: parseInt(ledEvent.circuit.substr(0, 1)), i: parseInt(ledEvent.circuit.substr(2))};
				let led = this.$accessory
					.getServiceByUUIDAndSubType(UniPiAccessory.Service.Lightbulb, `user-led-${s}.${i}`);
				if (!led) {
					led = new UniPiAccessory.Service.Lightbulb(`User Led ${s}.${i}`, `user-led-${s}.${i}`);
					led
						.setCharacteristic(UniPiAccessory.Characteristic.Manufacturer, "UniPi.technology")
						.setCharacteristic(UniPiAccessory.Characteristic.Model, "Neuron M203")
						.setCharacteristic(UniPiAccessory.Characteristic.SerialNumber, "140")
						.setCharacteristic(UniPiAccessory.Characteristic.FirmwareRevision, "Unknown")
						.setCharacteristic(UniPiAccessory.Characteristic.Name, `User Led ${s}.${i}`);
					this.accessory.addService(led);
				}
				led.getCharacteristic(UniPiAccessory.Characteristic.On)
					.on("get", (done) => this.getUserLedState(ledEvent.circuit, done))
					.on("set", (state, done) => this.setUserLedState(ledEvent.circuit, state, done));
				this.$userLeds.set(`user-led-${s}.${i}`, led);
			});
		} catch (error) {
			console.error(error, error.stack);
		}

	}

	get uuid() {
		return this.$accessory.uuid;
	}

	unregister() {
		this.$platform.unregisterUniPiAccessory(this);
	}

	/**
	 * Log a message from this accessory
	 * @param message
	 */
	log(...args) {
		this.$platform.log(this.$config.name || "UniPi", ...args);
	}

	/**
	 * Identify this unipi accessory!
	 */
	identify() {
		this.log("Identify");
	}

	/**
	 * Register an event handler with the accessory!
	 * @param eventName name of the event
	 * @param callback callback to execute upon event
	 */
	on(eventName, callback) {
		// Delegate to the internal accessory
		this.$accessory.on(eventName, callback);
	}

	static
	set homebridge(homebridge) {
		UniPiAccessory.$homebridge = homebridge;
	}

	static
	get UUID() {
		return UniPiAccessory.$homebridge.hap.uuid;
	}

	get Accessory() {
		return UniPiAccessory.$homebridge.platformAccessory;
	}

	static
	get Service() {
		return UniPiAccessory.$homebridge.hap.Service;
	}

	static
	get Characteristic() {
		return UniPiAccessory.$homebridge.hap.Characteristic;
	}
};

