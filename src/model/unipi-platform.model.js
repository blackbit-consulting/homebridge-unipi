"use strict";

/**
 * Reference to the UniPiAccessory model. This is the accessory we will instantiate for every linked UniPi device.
 *
 * @type {UniPiAccessory}
 */
const UniPiAccessory = require("./unipi-accessory.model").UniPiAccessory;

/**
 * Name of the plugin, used when registering or unregistering.
 * @type {string}
 */
const PLUGIN_NAME = "homebridge-unipi";

/**
 * Alias of the plugin. Used by HomeBridge to find the configuration entries of the platform.
 * @type {string}
 */
const UNIPI = "UniPi";

/**
 * We export the UniPiPlatform class. This class implements the platform, and is the first integration point with
 * homebridge. Homebridge will instantiate it only once, when loading the plugin.
 * This class will create instances of UniPiAccessory for every UniPi being added or restored.
 *
 * @type {UniPiPlatform}
 */
module.exports.UniPiPlatform = class UniPiPlatform {

	/**
	 * Register the platform with HomeBridge. Used from within ../index.module.js.
	 */
	static register() {
		UniPiPlatform.$homebridge.registerPlatform(
			PLUGIN_NAME,
			UNIPI,
			UniPiPlatform,
			true // DYNAMIC
		);
	}

	/**
	 * Utility method for easy logging.
	 * @param args
	 */
	log(...args) {
		this.$log.log(...args);
	}

	/**
	 * Constructs a new instances of the platform.
	 *
	 * @param log {{log:function(...args)}} A reference to the homebridge logger
	 * @param config {object} An object deserialized from the config.json file.
	 * @param homebridge {object} Homebridge instance.
	 */
	constructor(log, config, homebridge) {
		log("UniPi plugin for HomeBridge");
		log("Copyright © 2019 by Daan Kets, released under LGPLv3 License", homebridge.version);
		this.$log = log;
		this.$homebridge = homebridge;
		this.$config = {
			discovery: config && config.discovery && true || false,
			endpoints: config && config.endpoints && config.endpoints.map((endpoint) => {
				return endpoint && {
					id: endpoint.id,
					name: endpoint.name || "Untitled UniPi",
					host: endpoint.host || "localhost",
					port: endpoint.port || 80,
					wsPort: endpoint.wsPort || 8080,
					connectionSensor: endpoint.connectionSensor !== false,
					doublePressMaxDelay: endpoint.doublePressMaxDelay,
					longPressMinDelay: endpoint.longPressMinDelay,
					timers: endpoint.timers || [],
					input: endpoint.inputs || []
				} || null;
			})
		};

		// We keep a map of the accessories
		this.$accessories = new Map();

		this.$homebridge.on("didFinishLaunching", () => {
			this.log("Adding configured UniPi endpoints");
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
	 * @param accessory {UniPiPlatform.Accessory} The cached accessory to restore.
	 */
	configureAccessory(accessory) {
		this.log("Restoring accessory...", accessory);
		const deviceId = accessory.context.id;
		const config = this.$config.endpoints.find((endpoint) => endpoint.id === deviceId);
		if (config) {
			this.log("Config for accessory " + accessory.context.id + " found. Activating...");
			const uniPiAccessory = new UniPiAccessory(this, config, accessory);
			this.$accessories.set(accessory.uuid, uniPiAccessory);
			uniPiAccessory.start();
		} else {
			// Remove!
			this.log("Missing config for accessory with id " + accessory.context.id);
			this.log("Removing accessory");
			this.unregisterUniPiAccessory(accessory);
		}
	}

	/**
	 * Called upon adding an accessory!
	 *
	 * @param {string} hostNameOrIp The hostname or IP
	 */
	addAccessory(endpointInfo) {
		this.log("Adding UniPi endpoint...");
		const uniPiAccessory = new UniPiAccessory(this, endpointInfo, null);
		if (!this.$accessories.has(uniPiAccessory.uuid)) { // New endpoint, create
			this.$homebridge.registerPlatformAccessories(PLUGIN_NAME, UNIPI, [uniPiAccessory.accessory]);
			this.$accessories.set(uniPiAccessory.uuid, uniPiAccessory);

			// Start the connection to the new UniPi accessory.
			uniPiAccessory.start();
		}
	}

	/**
	 * For removing an accessory.
	 *
	 * @param uuid
	 */
	removeAccessory(uuid) {
		this.log("Removing Accessory...", uuid);
		let accessory = this.$accessories.get(uuid);
		if (accessory) {
			UniPiAccessory.stop();
			accessory.unregister();
			this.$accessories.delete(uuid);
		}
	}

	/**
	 * Unregister an accessory.
	 *
	 * @param accessory
	 */
	unregisterUniPiAccessory(accessory) {
		UniPiPlatform.$homebridge.unregisterPlatformAccessories("homebridge-unipi", "UniPi", [accessory]);
	}

	/**
	 * Sets a static reference to HomeBridge.
	 *
	 * @param homebridge
	 */
	static set homebridge(homebridge) {
		UniPiPlatform.$homebridge = homebridge;
		UniPiAccessory.homebridge = homebridge;
	}

	/**
	 * Shortcut to the UUID implementation of Node-HAP
	 *
	 * @return {UUID}
	 * @constructor
	 */
	static get UUID() {
		return UniPiPlatform.$homebridge.hap.uuid;
	}

	/**
	 * Shortcut to the HomeBridge PlatformAccessory implementation.
	 *
	 * @return {Accessory}
	 * @constructor
	 */
	get Accessory() {
		return UniPiPlatform.$homebridge.platformAccessory;
	}

	/**
	 * Shortcut to the Node-HAP Service class
	 *
	 * @return {Service}
	 * @constructor
	 */
	static get Service() {
		return UniPiPlatform.$homebridge.hap.Service;
	}

	/**
	 * Shortcut to the Node-HAP Characteristic class
	 * @return {Characteristic}
	 * @constructor
	 */
	static get Characteristic() {
		return UniPiPlatform.$homebridge.hap.Characteristic;
	}
};