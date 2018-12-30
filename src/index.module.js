"use strict";

/**
 * Main script, used for loading the library
 */

const UniPiPlatform = require("./model/unipi-platform.model").UniPiPlatform;
const UniPiAccessory=require("./model/unipi-accessory.model").UniPiAccessory;


/**
 * This function is called when homebridge loads the plugin.
 * @param homebridge {HomeBridge}
 */
module.exports = function(homebridge) {

	console.info("Loading UniPi-Platform on HomeBridge %s", homebridge.version);

	UniPiPlatform.homebridge = homebridge;

	/**
	 * Register the platform with homebridge. This will create a new instance of the platform, and set it up with
	 * homebridge.
	 */
	UniPiPlatform.register();
};