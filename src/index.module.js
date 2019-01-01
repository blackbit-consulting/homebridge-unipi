"use strict";

/**
 * Main script, used for loading the library
 */

const UniPiPlatform = require("./model/unipi-platform.model").UniPiPlatform;


/**
 * This function is called when homebridge loads the plugin.
 *
 * @param homebridge {object} Reference to the homebridge instance.
 */
module.exports = function(homebridge) {

	/**
	 * First, set a static reference to homebridge on the Platform. This way, we have access to all types we need.
	 * @type {Object}
	 */
	UniPiPlatform.homebridge = homebridge;

	/**
	 * Register the UniPiPlatform with homebridge. This will create a new instance of the platform, and set it up with
	 * homebridge.
	 */
	UniPiPlatform.register();
};