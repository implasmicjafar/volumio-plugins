'use strict';

var libQ = require('kew');
var fs=require('fs-extra');
var config = new (require('v-conf'))();
var exec = require('child_process').exec;
var execSync = require('child_process').execSync;

/**
 * The goal of this module is to allow a user use multiple outputs.
 * It accomplishes this by overwriting some methods from the core. 
 * a) A user should be able to fetch, assign and edit names to each possible audio output sink.
 * b) A user should be able to fetch, edit and save named virtual sink. The virtual sink should map to one or more unique named audio outputs.
 * c) A user should be able to select which output sink is played to. User can select from a list.
 * d) The named output sinks should be visible from airplay.
 */
module.exports = configuredSinks;
function configuredSinks(context) {
	var self = this;

	this.context = context;
	this.commandRouter = this.context.coreCommand;
	this.logger = this.context.logger;
	this.configManager = this.context.configManager;
}

configuredSinks.prototype.onVolumioStart = function() {
	var self = this;
	var configFile=this.commandRouter.pluginManager.getConfigurationFile(this.context,'config.json');
	this.config = new (require('v-conf'))();
	this.config.loadFile(configFile);

    // Replace the in-built method to start airplay
    var airplay_emulator = self.commandRouter.pluginManager.getPlugin("music_service", "airplay_emulation");
    if (airplay_emulator != undefined)
    {
        delete airplay_emulator["startShairportSync"];
        airplay_emulator.startShairportSync = self.startShairportSync;

        delete airplay_emulator["startShairportSyncMeta"];
        airplay_emulator.startShairportSyncMeta = self.startShairportSyncMeta;

        delete airplay_emulator["stopShairportSync"];
        airplay_emulator.stopShairportSync = self.stopShairportSync;

        module.exports = airplay_emulator;
    }

    return libQ.resolve();
}

/**
 * This function is an override for the alsa_controller plugin.
 * It overrides the UI for audio output settings.
 */
configuredSinks.prototype.onStart = function() {
    var self = this;
	var defer=libQ.defer();

    // Here we override some core methods.
    var alsa_controller = self.commandRouter.pluginManager.getPlugin("audio_interface", "alsa_controller");
    if (alsa_controller != undefined)
    {
        delete alsa_controller['getUIConfig'];
        alsa_controller.getUIConfig = self.getUIConfig;
        module.exports = alsa_controller;
    }

	// Once the Plugin has successfull started resolve the promise
	defer.resolve();

    return defer.promise;
};

configuredSinks.prototype.onStop = function() {
    var self = this;
    var defer=libQ.defer();

    // Once the Plugin has successfull stopped resolve the promise
    defer.resolve();

    return libQ.resolve();
};

configuredSinks.prototype.onRestart = function() {
    var self = this;
    // Optional, use if you need it
};


// Configuration Methods -----------------------------------------------------------------------------

configuredSinks.prototype.getUIConfig = function() {
    var defer = libQ.defer();
    var self = this;

    var lang_code = self.commandRouter.sharedVars.get('language_code');
    self.commandRouter.i18nJson(__dirname + '/i18n/strings_' + lang_code + '.json',
    __dirname + '/i18n/strings_en.json',
    __dirname + '/UIConfig.json')
    .then(function (uiconf) {
        defer.resolve(uiconf);
    })
    .fail(function (e) {
      self.logger.error('Error retrieving UIConf: ' + e);
      defer.reject(new Error());
    });

    return defer.promise;
};

configuredSinks.prototype.getConfigurationFiles = function() {
	return ['config.json'];
}

configuredSinks.prototype.setUIConfig = function(data) {
	var self = this;
	//Perform your installation tasks here
};

configuredSinks.prototype.getConf = function(varName) {
	var self = this;
	//Perform your installation tasks here
};

configuredSinks.prototype.setConf = function(varName, varValue) {
	var self = this;
	//Perform your installation tasks here
};

configuredSinks.prototype.startShairportSync = function() {
    var self = this;
};

configuredSinks.prototype.stopShairportSync = function() {
    var self = this;
};

configuredSinks.prototype.startShairportSyncMeta = function() {
    var self = this;
};

configuredSinks.prototype.deleteSwitch = function(switchId) {
    var self = this;
};

configuredSinks.prototype.addSwitch = function() {
    var self = this;
};

configuredSinks.prototype.saveSwitch = function(switchId) {
    var self = this;
};


// Playback Controls ---------------------------------------------------------------------------------------
// If your plugin is not a music_sevice don't use this part and delete it
/*

configuredSinks.prototype.addToBrowseSources = function () {

	// Use this function to add your music service plugin to music sources
    //var data = {name: 'Spotify', uri: 'spotify',plugin_type:'music_service',plugin_name:'spop'};
    this.commandRouter.volumioAddToBrowseSources(data);
};

configuredSinks.prototype.handleBrowseUri = function (curUri) {
    var self = this;

    //self.commandRouter.logger.info(curUri);
    var response;


    return response;
};



// Define a method to clear, add, and play an array of tracks
configuredSinks.prototype.clearAddPlayTrack = function(track) {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'configuredSinks::clearAddPlayTrack');

	self.commandRouter.logger.info(JSON.stringify(track));

	return self.sendSpopCommand('uplay', [track.uri]);
};

configuredSinks.prototype.seek = function (timepos) {
    this.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'configuredSinks::seek to ' + timepos);

    return this.sendSpopCommand('seek '+timepos, []);
};

// Stop
configuredSinks.prototype.stop = function() {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'configuredSinks::stop');


};

// Spop pause
configuredSinks.prototype.pause = function() {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'configuredSinks::pause');


};

// Get state
configuredSinks.prototype.getState = function() {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'configuredSinks::getState');


};

//Parse state
configuredSinks.prototype.parseState = function(sState) {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'configuredSinks::parseState');

	//Use this method to parse the state and eventually send it with the following function
};

// Announce updated State
configuredSinks.prototype.pushState = function(state) {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'configuredSinks::pushState');

	return self.commandRouter.servicePushState(state, self.servicename);
};


configuredSinks.prototype.explodeUri = function(uri) {
	var self = this;
	var defer=libQ.defer();

	// Mandatory: retrieve all info for a given URI

	return defer.promise;
};

configuredSinks.prototype.getAlbumArt = function (data, path) {

	var artist, album;

	if (data != undefined && data.path != undefined) {
		path = data.path;
	}

	var web;

	if (data != undefined && data.artist != undefined) {
		artist = data.artist;
		if (data.album != undefined)
			album = data.album;
		else album = data.artist;

		web = '?web=' + nodetools.urlEncode(artist) + '/' + nodetools.urlEncode(album) + '/large'
	}

	var url = '/albumart';

	if (web != undefined)
		url = url + web;

	if (web != undefined && path != undefined)
		url = url + '&';
	else if (path != undefined)
		url = url + '?';

	if (path != undefined)
		url = url + 'path=' + nodetools.urlEncode(path);

	return url;
};





configuredSinks.prototype.search = function (query) {
	var self=this;
	var defer=libQ.defer();

	// Mandatory, search. You can divide the search in sections using following functions

	return defer.promise;
};

configuredSinks.prototype._searchArtists = function (results) {

};

configuredSinks.prototype._searchAlbums = function (results) {

};

configuredSinks.prototype._searchPlaylists = function (results) {


};

configuredSinks.prototype._searchTracks = function (results) {

};

configuredSinks.prototype.goto=function(data){
    var self=this
    var defer=libQ.defer()

// Handle go to artist and go to album function

     return defer.promise;
};
*/
