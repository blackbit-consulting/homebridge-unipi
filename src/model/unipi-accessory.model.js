"use strict";

const Evok = require("../evok");
const RELAY_TYPE = "relay_type";
const packageVersion = require("../../package.json").version;

const WATCHDOG_LED_CIRCUIT = "1_01";
const WATCHDOG_INTERVAL = 3000;
const MAX_WATCHDOG_COUNT = 5;
const AUTO_RECONNECT_INTERVAL = 10000;
let stopping = false;
/**
 * This class represents a single UniPi Accessory. It acts as a gateway for retrieving information from the device,
 * and for sending commands to the device. This class represents the Accessory in HomeBridge.
 */
module.exports.UniPiAccessory = class UniPiAccessory {

	/**
	 * Construct a new UniPi accessory
	 * @param config {object} An object with configuration data
	 * @param platform {UniPiPlatform} The UniPi platform instance
	 * @param accessory {Accessory} The UniPi HomeBridge accessory object
	 */
	constructor(platform, config, accessory) {
		this.$platform = platform;
		this.$watchDogLedState = 0;
		this.$maintenanceModeActive = false;
		if (accessory) {
			this.$accessory = accessory;
			if (config) {
				this.$config = this.$accessory.context = config;
			} else {
				this.$config = this.$accessory.context;
			}
		} else {
			this.$config = config;
			this.$uuid = UniPiAccessory.UUID.generate(this.$config.id);
			this.$accessory = new UniPiAccessory.$homebridge.platformAccessory(this.$config.name, this.$uuid);
			this.$accessory.context = this.$config;
			this.$accessory
				.getService(UniPiAccessory.Service.AccessoryInformation)
				.setCharacteristic(UniPiAccessory.Characteristic.Manufacturer, "UniPi.technology")
				.setCharacteristic(UniPiAccessory.Characteristic.Model, "Neuron <Pending>")
				.setCharacteristic(UniPiAccessory.Characteristic.SerialNumber, "Pending")
				.setCharacteristic(UniPiAccessory.Characteristic.FirmwareRevision, "Pending");
		}
		this.$timers = this.$config && this.$config.timers && this.$config.timers.map((timerConfig) => {
			this.log("Timer on " + timerConfig.relayType + " relay " + timerConfig.circuit);
			return {
				relayType: timerConfig.relayType,
				circuit: timerConfig.circuit,
				timeout: timerConfig.timeout,
				pulse: timerConfig.pulse,
				name: timerConfig.name,
				cancelTimeout: null
			};
		}) || [];

		this.$connectionSensor = this.$accessory.getServiceByUUIDAndSubType(
			UniPiAccessory.Service.ContactSensor,
			"evok-connection"
		);

		if (this.$config.connectionSensor !== false) {
			if (!this.$connectionSensor) {
				this.log("Contact sensor configured. Adding service...");
				this.$connectionSensor = new UniPiAccessory.Service.ContactSensor(
					`${this.$config.name} Connection`,
					"evok-connection"
				);
				this.$connectionSensor
					.setCharacteristic(UniPiAccessory.Characteristic.Name, `${this.$config.name} Connection`);
				this.$accessory.addService(this.$connectionSensor);
			}
		} else {
			if (this.$connectionSensor) {
				this.log("Contact sensor unconfigured. Removing service...");
				this.$accessory.removeService(this.$connectionSensor);
				this.$connectionSensor = null;
			}
		}
		this.unreachable();

		this.$accessory.on("identify", (paired, next) => this.identify(paired, next));
	}

	$setupMaintenanceMode() {
		let maintenanceSwitchId = this.$config.id + "-maintenance";
		let maintenanceSwitchService =
			this.$accessory.getServiceByUUIDAndSubType(
				UniPiAccessory.Service.Switch,
				maintenanceSwitchId
			);
		if (!maintenanceSwitchService) {
			maintenanceSwitchService = new UniPiAccessory.Service.Switch(
				"Maintenance mode",
				maintenanceSwitchId
			);
			this.$accessory.addService(maintenanceSwitchService);
		}
		maintenanceSwitchService.setCharacteristic(UniPiAccessory.Characteristic.On);
		maintenanceSwitchService.getCharacteristic(UniPiAccessory.Characteristic.On)
			.on("get", (done) => {
				this.safeCallback(done, null, this.$maintenanceModeActive);
			})
			.on("set", (state, done) => {
				this.$maintenanceModeActive = state;
				this.safeCallback(done);
			});
	}

	/**
	 * Setup virtual switches for impulse relays. This works in combination with the timer feature.
	 */
	$setupPulseRelays() {
		this.$timers.forEach((timer) => {
			let {s, i} = {
				s: parseInt(timer.circuit.substr(0, 1)),
				i: parseInt(timer.circuit.substr(2))
			};
			let id = `virtual-${timer.relayType}-impulse-relay-${s}.${i}`;
			let outputType = timer.relayType === "digital" ? "digital output" : "relay";
			if (timer.pulse) {
				let virtualImpulseRelay = this.$accessory.getServiceByUUIDAndSubType(UniPiAccessory.Service.Switch, id);
				if (!virtualImpulseRelay) {
					this.log("Configuring virtual impulse relay on", outputType, s, i);
					virtualImpulseRelay = new UniPiAccessory.Service
						.Switch(timer.name || `Virtual impulse relay on ${outputType} ${s} ${i}`, id)
					this.$accessory.addService(virtualImpulseRelay);
					virtualImpulseRelay
						.getCharacteristic(UniPiAccessory.Characteristic.On)
						.updateValue(false);
				} else {
					// Update the name of the virtual relay on startup
					virtualImpulseRelay
						.setCharacteristic(
							UniPiAccessory.Characteristic.Name,
							timer.name || `Virtual impulse relay on ${outputType} ${s} ${i}`, id
						)
				}
				let onCharacteristic =
					virtualImpulseRelay
						.getCharacteristic(UniPiAccessory.Characteristic.On);

				onCharacteristic
					.on("set", (state, done) => {
						this.log("SET VIRTUAL IMPULSE", id, "to", state);
						if (this.$maintenanceModeActive) {
							this.safeCallback(done, null, state);
							return;
						}

						// Check current state!
						onCharacteristic.getValue((error, currentState) => {
							if (state === currentState) {
								this.log("SET VIRTUAL IMPULSE", id, "already in state", state);
								this.safeCallback(done, null, state);
								return;
							}
							// Trigger the output linked to the timer only if the current state is different!
							switch (timer.relayType) {
								case "digital":
									timer.ignoreNextToggle = true;
									this.setDigitalOutputState(timer.circuit, true, (error) => {
										this.safeCallback(done, error, state);
									});
									break;
								case "physical":
									timer.ignoreNextToggle = true;
									this.setRelayOutputState(timer.circuit, true, (error) => {
										this.safeCallback(done, error, state);
									});
									break;
								default:
									this.safeCallback(done, "no_such_output");
							}
						});
					});
			} else {
				let virtualImpulseRelay = this.$accessory.getServiceByUUIDAndSubType(UniPiAccessory.Service.Switch, id);
				if (virtualImpulseRelay) {
					this.log("Removing virtual impulse relay on", outputType, s, i);
					this.$accessory.removeService(virtualImpulseRelay);
				}
			}
		});
	}

	togglePulseRelay(timer) {
		let {s, i} = {
			s: parseInt(timer.circuit.substr(0, 1)),
			i: parseInt(timer.circuit.substr(2))
		};
		let id = `virtual-${timer.relayType}-impulse-relay-${s}.${i}`;
		let outputType = timer.relayType === "digital" ? "digital output" : "relay";
		if (timer.pulse) {
			let virtualImpulseRelay = this.$accessory.getServiceByUUIDAndSubType(UniPiAccessory.Service.Switch, id);
			if (!virtualImpulseRelay) {
				this.log("Missing virtual impulse relay on ", outputType, s, i);
				return;
			}
			if (this.$maintenanceModeActive) {
				this.log("Maintenance mode active. Not switching virtual impulse relay", outputType, s, i);
				return;
			}
			if (timer.ignoreNextToggle) {
				this.log("Pulse relay state already up-to-date", outputType, s, i);
				timer.ignoreNextToggle = false;
				return;
			}
			virtualImpulseRelay
				.getCharacteristic(UniPiAccessory.Characteristic.On)
				.getValue((error, state) => {
					virtualImpulseRelay.getCharacteristic(UniPiAccessory.Characteristic.On)
						.updateValue(!state);
					this.log("Changed impulse relay state of", outputType, s, i, "to", !state);
				});
		}
	}

	$setupDigitalOutputs() {
		try {
			this.$digitalOutputs = new Map();
			this.assertConnected();
			let digitalOutputs = this.$device.digitalOutputs();
			digitalOutputs.forEach((digOutEvent) => {
				let {s, i} = {
					s: parseInt(digOutEvent.circuit.substr(0, 1)),
					i: parseInt(digOutEvent.circuit.substr(2))
				};
				let digOut = this.$accessory
					.getServiceByUUIDAndSubType(UniPiAccessory.Service.Switch, `digital-relay-${s}.${i}`);
				if (!digOut) {
					digOut = new UniPiAccessory.Service.Switch(`Digital Output ${s}.${i}`, `digital-relay-${s}.${i}`);
					this.accessory.addService(digOut);
				}
				digOut
					.getCharacteristic(UniPiAccessory.Characteristic.On)
					.on("get", (done) => this.getDigitalOutputState(digOutEvent.circuit, done))
					.on("set", (state, done) => this.setDigitalOutputState(digOutEvent.circuit, state, done));
				this.$digitalOutputs.set(`digital-relay-${s}.${i}`, digOut);
			});
		} catch (error) {
			this.log(error, error.stack);
		}
	}

	$setupRelayOutputs() {
		try {
			this.$relayOutputs = new Map();
			this.assertConnected();
			let relays = this.$device.relays();
			relays.forEach((relayEvent) => {
				let {s, i} = {
					s: parseInt(relayEvent.circuit.substr(0, 1)),
					i: parseInt(relayEvent.circuit.substr(2))
				};
				let relay = this.$accessory
					.getServiceByUUIDAndSubType(UniPiAccessory.Service.Switch, `physical-relay-${s}.${i}`);
				if (!relay) {
					relay = new UniPiAccessory.Service.Switch(`Relay ${s}.${i}`, `physical-relay-${s}.${i}`);
					this.accessory.addService(relay);
				}
				relay
					.getCharacteristic(UniPiAccessory.Characteristic.On)
					.on("get", (done) => this.getRelayOutputState(relayEvent.circuit, done))
					.on("set", (state, done) => this.setRelayOutputState(relayEvent.circuit, state, done));
				this.$relayOutputs.set(`physical-relay-${s}.${i}`, relay);
			});
		} catch (error) {
			this.log(error, error.stack);
		}
	}

	$setupDigitalInputs() {
		try {
			this.$digitalInputs = new Map();
			this.$digitalInputStates = new Map();
			this.assertConnected();
			let digitalInputs = this.$device.inputs().sort((inputA, inputB) => {
				return inputA.circuit.localeCompare(inputB.circuit);
			});
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
					digIn = new UniPiAccessory.Service.StatelessProgrammableSwitch(
						`Digital Input ${s}.${i}`,
						`digital-input-${s}.${i}`
					);
					this.accessory.addService(digIn);
				}
				digIn
					.getCharacteristic(UniPiAccessory.Characteristic.ProgrammableSwitchEvent)
					.setProps({
						minValue: UniPiAccessory.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
						maxValue: UniPiAccessory.Characteristic.ProgrammableSwitchEvent.LONG_PRESS
					});
				digIn
					.getCharacteristic(UniPiAccessory.Characteristic.ServiceLabelIndex)
					.setValue(l);

				this.$digitalInputs.set(`digital-input-${s}.${i}`, digIn);
				let inputConfig =
					this.$config &&
					this.$config.inputs &&
					this.$config.$inputs[`${s}_${i}`] ||
					{
						maxRepeatCount: (this.$config.inputs && this.$config.inputs.maxRepeatCount) || 10
					};

				this.$digitalInputStates.set(`digital-input-${s}.${i}`, {
					down: false,
					downTime: null,
					upTime: null,
					cancelTimer: null,
					labelIndex: l,
					repeatCount: 0,
					repeatStart: null,
					maxRepeatCount: inputConfig.maxRepeatCount || (
						this.$config.inputs && this.$config.inputs.maxRepeatCount
					) || 10
				});
			});
		} catch (error) {
			this.log(error, error.stack);
		}
	}

	processOnOffEvent(event) {
		// DISABLED this.log("Processing relay event %j", event);
		let {s, i} = {s: parseInt(event.circuit.substr(0, 1)), i: parseInt(event.circuit.substr(2))};
		let device = null;
		if (event.dev === "relay" && event[RELAY_TYPE] === "digital") {
			const digOutId = `digital-relay-${s}.${i}`;
			device = this.$digitalOutputs.get(digOutId);
		} else if (event.dev === "relay" && event[RELAY_TYPE] === "physical") {
			const relayId = `physical-relay-${s}.${i}`;
			device = this.$relayOutputs.get(relayId);
		} else if (event.dev === "led") {
			const ledId = `user-led-${s}.${i}`;
			device = this.$userLeds.get(ledId);
		}
		if (device) {
			device
				.getCharacteristic(UniPiAccessory.Characteristic.On)
				.getValue((error, state) => {

					if (state === event.value && true || false) {
						return; // SKIP IF THE STATE DID NOT CHANGE! Especially try during boot.
					}
					device
						.getCharacteristic(UniPiAccessory.Characteristic.On)
						.updateValue(event.value && true || false);
					let timer = this.$timers.find((timer) => {
						return (timer.relayType === event[RELAY_TYPE] && timer.circuit === event.circuit);
					});
					if (timer) {
						if (timer.cancelTimeout) {
							this.log("Timer cleared for circuit " + event.circuit);
							clearTimeout(timer.cancelTimeout);
							timer.cancelTimeout = null;
						}
						if (event.value && true) { // When turned on, enable the timer!
							this.log("Timer started for circuit " + event.circuit);
							timer.cancelTimeout = setTimeout(() => { // After timer expiry
								timer.cancelTimout = null; // Drop the timer handle
								this.log("Timeout for circuit " + event.circuit);
								device // Switch the device off
									.setCharacteristic(UniPiAccessory.Characteristic.On, false);
							}, timer.timeout);
							if (timer && timer.pulse) {
								this.togglePulseRelay(timer);
							}
						}
					}
				});
		}
	}

	processDigitalInputEvent(event) {
		// DISABLED this.log("Processing digital input event %j", event);
		let {s, i} = {s: parseInt(event.circuit.substr(0, 1)), i: parseInt(event.circuit.substr(2))};
		const digInId = `digital-input-${s}.${i}`;
		let digIn = this.$digitalInputs.get(digInId);
		let state = this.$digitalInputStates.get(digInId);
		if (digIn) {
			if (event.value === 1) {
				// DISABLED this.log("Digital input " + digInId + " DOWN");
				state.down = true;
				state.downTime = Date.now();
				if (!state.cancelLongPressInterval) {
					this.log("LONG PRESS TIMER", digInId, "LABEL", state.labelIndex);
					state.cancelLongPressInterval = setInterval(() => {
						state.repeatStart = state.repeatStart || new Date().getTime();
						// PREVENT TOO MANY REPEATS
						if (state.repeatCount >= state.maxRepeatCount) {
							this.log(
								`REPEAT LOOP DETECTED FOR DIGITAL IN ${s}.${i} (label index ${state.labelIndex}).` +
								` - YOUR BUTTON MAY BE STUCK`
							);
						} else {
							this.log("LONG PRESS", digInId, "LABEL", state.labelIndex);
							state.repeatCount++;
							state.longPressRelease = true;
							if (this.processRuleIfAny("input", `${s}_${i}`, "long")) {
								return;
							}
							digIn
								.getCharacteristic(UniPiAccessory.Characteristic.ProgrammableSwitchEvent)
								.updateValue(UniPiAccessory.Characteristic.ProgrammableSwitchEvent.LONG_PRESS);
						}
					}, (this.$config.longPressMinDelay || 1000));
				}
			}
			if (event.value === 0) {
				// DISABLED this.log("Digital input " + digInId + " UP");
				let wasDown = state.down;
				state.down = false;
				state.upTime = Date.now();
				if (state.cancelLongPressInterval) {
					clearInterval(state.cancelLongPressInterval);
					state.cancelLongPressInterval = null;
				}
				if (wasDown) {
					if (state.cancelTimer) { // DOUBLE CLICK
						clearTimeout(state.cancelTimer);
						state.cancelTimer = null;
						this.log("DOUBLE PRESS", digInId, "LABEL", state.labelIndex);
						if (this.processRuleIfAny("input", `${s}_${i}`, "double")) {
							return;
						}
						digIn
							.getCharacteristic(UniPiAccessory.Characteristic.ProgrammableSwitchEvent)
							.updateValue(UniPiAccessory.Characteristic.ProgrammableSwitchEvent.DOUBLE_PRESS);
					} else if (state.longPressRelease) {
						// DISABLED this.log("IGNORE LONG PRESS RELEASE", digInId);
						state.longPressRelease = false;
						state.repeatCount = 0;
					} else {
						// DISABLED this.log("SINGLE PRESS", digInId, "in", (this.$config.doublePressMaxDelay || 500), "ms");
						state.cancelTimer = setTimeout(() => {
							state.cancelTimer = null;
							this.log("SINGLE PRESS", digInId, "LABEL", state.labelIndex);
							if (this.processRuleIfAny("input", `${s}_${i}`, "single")) {
								return;
							}
							digIn
								.getCharacteristic(UniPiAccessory.Characteristic.ProgrammableSwitchEvent)
								.updateValue(UniPiAccessory.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);
						}, (this.$config.doublePressMaxDelay || 500));
					}
				}
			}
		}
	}

	/**
	 * Process rule for an event
	 * @param dev {string} Device
	 * @param circuit {string} Circuit
	 * @param event {string} event
	 * @return {boolean} true if this event must be suppressed
	 */
	processRuleIfAny(dev, circuit, event) {
		// If there is a rule for this event, process it!
		if (this.$config.rules) {
			let rule = this.$config.rules.find((rule) => {
				return rule.when && rule.when.dev === "input" && rule.when.circuit === `${circuit}` && rule.when.event === event;
			});
			if (rule) {
				this.log(`Rule '${rule.name}' found for this event`);
				if (rule.then) {
					rule.then.forEach((action) => {
						if (action.dev === "relay") {
							switch (action.relayType) {
								case "physical":
									this.setRelayOutputState(action.circuit, action.state === true);
									break;
								case "digital":
									this.setDigitalOutputState(action.circuit, action.state === true);
									break;
								default:
									break;
							}
						} else if (action === "led") {
							this.setUserLedState(action.circuit, action.state === true);
						}
					});
				}
				if (rule.mute) {
					// Do not raise event!
					return true;
				}
			}
		}
		return false;
	}

	processUniPiEvent(event) {
		this.resetWatchDog();

		// DISABLED this.log(event);
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
	}

	start() {
		this.$device = new Evok({
			host: this.$config.host,
			restPort: this.$config.port,
			wsPort: this.$config.wsPort
		});

		this.resetWatchDog();


		this.$device
			.on("connected", () => {
				this.reachable();

				if (!this.$alreadyConnected) {
					this.$alreadyConnected = true;
					this.$setupDigitalOutputs();
					this.$setupRelayOutputs();
					this.$setupDigitalInputs();
					this.$setupUserLeds();
					this.$setupPulseRelays();
					this.$setupMaintenanceMode();
				}
				// Set initial states
				this.$device
					.devices()
					.forEach((device) => {
						this.processUniPiEvent(device);
					});
				this.startWatchDog();
			})
			.on("error", (error) => {
				this.log("Connection error", error, error.stack);
				this.stop(!stopping);
				// this.reconnect();
			})
			.on("message", (device = {}) => {
				device.forEach((message) => this.processUniPiEvent(message));
			})
			.on("disconnected", () => {
				this.log("Disconnected");
				this.stop(!stopping);
			});
		this.reconnect();
	}

	reachable() {
		this.$connected = true;
		if (this.$config.contactSensor) {
			this.$connectionSensor
				.setCharacteristic(UniPiAccessory.Characteristic.ContactSensorState, false);
		}
	}

	unreachable() {
		this.$connected = false;
		if (this.$config.contactSensor) {
			this.$connectionSensor
				.setCharacteristic(UniPiAccessory.Characteristic.ContactSensorState, true);
		}
	}

	startWatchDog() {
		this.log("Starting watchdog %s", packageVersion);
		this.$watchDogInterval = setInterval(() => {
			this.$watchDogCounter++;
			this.$watchDogLedState++;
			this.setUserLedState(WATCHDOG_LED_CIRCUIT, this.$watchDogLedState % 2 && true || false);
			if (this.$watchDogCounter > MAX_WATCHDOG_COUNT) {
				this.log("Communication watchdog triggered: Resetting connection!");
				this.stop(true);
			}
		}, WATCHDOG_INTERVAL);
	}

	resetWatchDog() {
		this.$watchDogCounter = 0; // Reset to 0 or 1 (keep LED interval state)
	}

	reconnect() {
		try {
			this.$device.connect();
		} catch (error) {
			this.log("Problem connecting to UniPi device. Reconnecting in 10s...", error, error.stack);
			setTimeout(() => {
				this.reconnect();
			}, AUTO_RECONNECT_INTERVAL);
		}
	}

	stop(restart) {
		if (!restart) {
			// Stopping
			this.log("Stopping UniPi Accessory...");
			stopping = true;
		}
		try {
			clearInterval(this.$watchDogInterval);
			this.$device.close();
		} catch (error) {
			this.log("Error while disconnecting. Connection may already be closed.");
		}
		this.unreachable();
		if (restart) {
			this.start();
		}
	}

	get accessory() {
		return this.$accessory;
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
			// DISABLED this.log("Setting Digital Output " + circuit + " to " + state);
			let value = this.$device.digitalOutput(circuit, state && true || false);
			this.safeCallback(done, null, value);
		} catch (error) {
			this.log("Error setting digital out state", error, error.stack);
			this.safeCallback(done, error);
		}
	}

	assertConnected() {
		if (!this.$connected) {
			throw "not_connected";
		}
	}

	getDigitalOutputState(circuit, done) {
		try {
			// DISABLED this.log("Reading Digital Output " + circuit);
			this.assertConnected();
			let value = this.$device.digitalOutput(circuit);
			this.safeCallback(done, null, value);
		} catch (error) {
			this.log("Error reading digital out state", error, error.stack);
			this.safeCallback(done, error);
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
			this.log("Setting Relay Output", circuit, "to", state);
			this.assertConnected();
			let value = this.$device.relay(circuit, state && true || false);
			this.safeCallback(done, null, value);
		} catch (error) {
			this.log("Error setting relay state", error, error.stack);
			this.safeCallback(done, error);
		}
	}

	getRelayOutputState(circuit, done) {
		try {
			// DISABLED this.log("Reading Relay Output " + circuit);
			this.assertConnected();
			let value = this.$device.relay(circuit);
			this.safeCallback(done, null, value);
		} catch (error) {
			this.log("Error reading relay state", error, error.stack);
			this.safeCallback(done, error);
		}
	}

	setUserLedState(circuit, state, done) {
		try {
			// DISABLED this.log("Setting User Led " + circuit + " to " + state);
			this.assertConnected();
			let value = this.$device.led(circuit, state && true || false);
			this.safeCallback(done, null, value);
		} catch (error) {
			this.log("Error setting led state", error, error.stack);
			this.safeCallback(done, error);
		}
	}

	getUserLedState(circuit, done) {
		try {
			// DISABLED this.log("Reading User Led " + circuit);
			this.assertConnected();
			let value = this.$device.led(circuit);
			this.safeCallback(done, null, value);
		} catch (error) {
			this.log("Error reading led state", error, error.stack);
			this.safeCallback(done, error);
		}
	}

	$setupUserLeds() {
		try {
			this.$userLeds = new Map();
			this.assertConnected();
			let leds = this.$device.leds();
			leds.forEach((ledEvent) => {
				let {s, i} = {s: parseInt(ledEvent.circuit.substr(0, 1)), i: parseInt(ledEvent.circuit.substr(2))};
				let led = this.$accessory
					.getServiceByUUIDAndSubType(UniPiAccessory.Service.Lightbulb, `user-led-${s}.${i}`);
				if (!led) {
					led = new UniPiAccessory.Service.Lightbulb(`User Led ${s}.${i}`, `user-led-${s}.${i}`);
					led.setCharacteristic(UniPiAccessory.Characteristic.Name, `User Led ${s}.${i}`);
					this.accessory.addService(led);
				}
				led.getCharacteristic(UniPiAccessory.Characteristic.On)
					.on("get", (done) => this.getUserLedState(ledEvent.circuit, done))
					.on("set", (state, done) => this.setUserLedState(ledEvent.circuit, state, done));
				this.$userLeds.set(`user-led-${s}.${i}`, led);
			});
		} catch (error) {
			this.log("Error while reading leds", error, error.stack);
		}

	}

	/**
	 * Returns the uuid of this accessory. Used by registration procedure.
	 * TODO - ESHint incorrectly assumes unused.
	 * @return {string} UUID.
	 */
	get uuid() {
		return this.$accessory.uuid;
	}

	/**
	 * Unregister this accessory from the platform.
	 */
	unregister() {
		this.$platform.unregisterUniPiAccessory(this.accessory);
	}

	/**
	 * Log a message from this accessory (with prefix)
	 * @param args 0 or more arguments to log
	 */
	log(...args) {
		this.$platform.log(this.$config.name || "UniPi", ...args);
	}

	/**
	 * Identify this unipi accessory!
	 */
	identify(paired, callback) {
		this.log("Look for a rapidly blinking User led X1 on your UniPi to identify!", this.$config.name, paired);
		if (!this.$identityInterval) {
			this.$identityIntervalCounter = 0;
			this.$identityInterval = setInterval(() => {
				this.$identityIntervalCounter++;
				this.setUserLedState("1_01", this.$identityIntervalCounter % 2 && true || false, () => {
				});
				if (this.$identityIntervalCounter === 40) {
					this.log("Identity interval stopped.")
					clearInterval(this.$identityInterval);
					this.$identityInterval = null;
				}
			}, 300);
		} else {
			this.log("Resetting identification timer! Keep looking for a rapidly blinking X1 led to identify.");
			this.$identityIntervalCounter = 0; // Reset the counter and keep running!
		}

		this.safeCallback(callback);
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

	safeCallback(cb, error, ...results) {
		try {
			if (cb) {
				cb(error, ...results)
			}
		} catch (error) {
			this.log("Error executing callback", error, error.stack);
		}
	}
};

