"use strict";

const UniPiAccessory = require("./unipi-accessory.model").UniPiAccessory;
const packageData = require("../../package.json");

module.exports.UniPiPlatform = class UniPiPlatform {

	/**
	 * Register the platform with HomeBridge
	 */
	static register() {
		UniPiPlatform.$homebridge.registerPlatform(
			"homebridge-unipi-evok",
			"UniPi",
			UniPiPlatform,
			true // DYNAMIC
		);
	}

	log(...args) {
		this.$log.log(...args);
	}

	constructor(log, config, homebridge) {
		this.$log = log;
		this.$homebridge = homebridge;
		this.$config = {
			discovery: config && config.discovery && true || false,
			endpoints: config && config.endpoints && config.endpoints.map((endpoint) => {
				return endpoint && {
					name: endpoint.name || "Untitled UniPi",
					host: endpoint.host || "localhost",
					port: endpoint.port || 80,
					wsPort: endpoint.wsPort || 8080
				} || null;
			})
		};
		this.$accessories = new Map();

		this.log("Constructing new instance");

		this.$homebridge.on("didFinishLaunching", () => {
			this.$config.endpoints.forEach((endpoint) => {
				this.addAccessory(endpoint);
			});

			this.log("Finished launching!");
		});
	}

	/**
	 * Required method, called by HomeBridge upon restoring of a known accessory. This is why it is important that
	 * accessory id's are always generated equally!
	 *
	 * @param accessory
	 */
	configureAccessory(accessory) {
		this.log("Restoring accessory...", accessory);
		const uniPiAccessory = new UniPiAccessory(this, null, accessory);
		this.$accessories.set(accessory.uuid, uniPiAccessory);
		uniPiAccessory.start();
	}

	/**
	 * Called upon adding an accessory!
	 *
	 * @param {string} hostNameOrIp The hostname or IP
	 */
	addAccessory(endpointInfo) {
		this.log("Adding accessory...");
		const uniPiAccessory = new UniPiAccessory(this, endpointInfo, null);
		if (!this.$accessories.has(uniPiAccessory.uuid)) {
			this.$homebridge.registerPlatformAccessories("homebridge-unipi-evok", "UniPi", [uniPiAccessory.accessory]);
			this.$accessories.set(uniPiAccessory.uuid, uniPiAccessory);
			uniPiAccessory.start();
		}
	}

	removeAccessory(uuid) {
		this.log("Removing Accessory...", uuid);
		let accessory = this.$accessories.get(uuid);
		if (accessory) {
			accessory.unregister();
			this.$accessories.delete(uuid);
		}
	}

	unregisterUniPiAccessory(uniPiAccessory) {
		UniPiAccessory.stop();
		UniPiAccessory.$homebridge.unregisterPlatformAccessories("homebridge-unipi-evok", "UniPi", [uniPiAccessory.accessory]);
	}

	static set homebridge(homebridge) {
		UniPiPlatform.$homebridge = homebridge;
		UniPiAccessory.homebridge = homebridge;
	}

	static get UUID() {
		return UniPiPlatform.$homebridge.hap.uuid;
	}

	get Accessory() {
		return UniPiPlatform.$homebridge.platformAccessory;
	}

	static get Service() {
		return UniPiPlatform.$homebridge.hap.Service;
	}

	static get Characteristic() {
		return UniPiPlatform.$homebridge.hap.Characteristic;
	}
};