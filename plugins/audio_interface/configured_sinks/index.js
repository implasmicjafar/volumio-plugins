'use strict';

var libQ = require('kew');
var fs = require('fs-extra');
var http = require('http');
const isIP = require('is-ip');
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
    this.configuration = {};
    this.token = 0;
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

configuredSinks.prototype.getUIRedirect = function() {
    var self = this;
    return self.commandRouter.executeOnPlugin('audio_interface', 'configured_sinks', 'getUIConfig');
};

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
        alsa_controller.getUIConfig = self.getUIRedirect;
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
configuredSinks.prototype.getZones = async function(configs, section, scan)
{
    var self = this;
};

configuredSinks.prototype.getSpeakers = async function(configs, section, scan)
{
    var self = this;
    section.content = [];
    if ((configs != undefined) && (configs.speakers != undefined))
    {
        for (var ijx = 0; ijx < configs.speakers.length; ijx++)
        {
            var element = configs.speakers[ijx];
            var speaker = JSON.parse(JSON.stringify(element));
            speaker.delete =
            {
                id: 'speaker_' + ijx + '_delete',
                onClick : {
                    askForConfirm : {
                        title: 'Delete Confirmation',
                        message: 'Are you want to delete ' + speaker.name + '?'
                    },
                    type: 'emit',
                    message: 'callMethod',
                    data:{
                        endpoint:'audio_interface/configured_sinks',
                        method: 'deleteSpeaker',
                        data: 
                        {
                            token : self.token,
                            id: speaker.id
                        }
                    }
                }
            };

            speaker.edit =
            {
                id: 'speaker_' + ijx + '_edit',
                onClick: {
                    type: 'emit',
                    message: 'callMethod',
                    data: {
                        endpoint: 'audio_interface/configured_sinks',
                        method: 'editSpeaker',
                        data: 
                        {
                            token : self.token,
                            id: speaker.id
                        }                                 
                    }
                }
            };

            speaker.view =
            {
                id: 'speaker_' + ijx + '_edit',
                onClick: {
                    type: 'emit',
                    message: 'callMethod',
                    data: {
                        endpoint: 'audio_interface/configured_sinks',
                        method: 'viewSpeaker',
                        data: 
                        {
                            token : self.token,
                            id: speaker.id
                        }                                 
                    }
                }
            };

            var swName = '';
            configs.switches.forEach(aswitch => {
                if (aswitch.id == speaker.sw)
                {
                    swName = aswitch.name;
                }
            });

            speaker.save =
            {
                id: 'speaker_' + ijx + '_save',
                onClick: {
                    type: 'emit',
                    message: 'callMethod',
                    data: {
                        endpoint: 'audio_interface/configured_sinks',
                        method: 'saveSpeaker',
                        data: {
                            token: self.token,
                            id : speaker.id,
                            name: speaker.name,
                            sw: {id:speaker.sw, name:swName},
                            device: speaker.device,
                            mixer: speaker.mixer,
                            control: speaker.control,
                            playing: speaker.playing
                        }                                    
                    }
                }
            };

            section.content.push(speaker);
        }

        var devices = [];
        if (scan || (configs.devices.length == 0))
        {

        }
        
        section.devices = devices;
        section.switches = [];
        configs.switches.forEach(aswitch => {
            section.switches.push({id:aswitch.id, name:aswitch.name});
        });

        section.add = 
        {
            id:"speaker_add",
            onClick:{
                type:'emit',
                message:'callMethod',
                data:{
                    endpoint:'audio_interface/configured_sinks',
                    method:'addSpeaker',
                    data:{
                        token: self.token
                    }
                }
            }
        };
    }
};

configuredSinks.prototype.getSwitches = async function(configs, section, scan)
{
    var self = this;
    section.content = [];                   
    if ((configs != undefined) && (configs.switches != undefined))
    {      
        for (var ijx = 0; ijx < configs.switches.length; ijx++)
        {
            var element = configs.switches[ijx];                        
            var aswitch = JSON.parse(JSON.stringify(element));              
            if ((aswitch.ip != undefined) && (aswitch.ip !== ""))
            {     
                if (scan)
                {         
                    aswitch.reachable = false;                                                                            
                    var options = {
                        host: aswitch.ip,
                        path: '/cm?cmnd=Status'
                    }
                                        
                    var request_call = new Promise((resolve, reject) => {
                        var data = '';                                
                        var request = http.request(options, function (res) {                
                            res.on('data', function (chunk) {
                                data += chunk;
                            });
            
                            res.on('end', function () {                                    
                                resolve(data);                                            
                            });                                        
                        }); 
                        
                        request.on('error', function (e) {                                                                                    
                            reject(e);
                        });
            
                        request.end();
                    });
                    
                    try
                    {
                        var data = await request_call;
                        var jsonObj = undefined;
                        if (data === '')
                        {                                        
                        }
                        else
                        {
                            jsonObj = JSON.parse(data);
                        }

                        if (jsonObj != undefined)
                        {
                            aswitch.status = jsonObj.Status.Power;
                            aswitch.reachable = true;
                            element.reachable = true;
                            if (aswitch.status == 0)
                            {
                                element.status = 0;
                            }else
                            {
                                element.status = 1;
                            }
                        }
                        else
                        {
                            aswitch.status = -5;
                            element.status = -5;
                        }
                    }
                    catch (error)
                    {
                        console.log(error.message);
                        aswitch.status = -5;
                        element.status = -5;
                    }  
                }        
                
                section.content.push(aswitch); 
            }
            else
            {
                aswitch.reachable = false;
                element.reachable = false;
                aswitch.status = -3;
                element.status = -3;
                section.content.push(aswitch);
            }  
            
            
            aswitch.delete =
            {
                id: 'switch_' + ijx + '_delete',
                onClick : {
                    askForConfirm : {
                        title: 'Delete Confirmation',
                        message: 'Are you want to delete ' + aswitch.name + '?'
                    },
                    type: 'emit',
                    message: 'callMethod',
                    data:{
                        endpoint:'audio_interface/configured_sinks',
                        method: 'deleteSwitch',
                        data: 
                        {
                            id: aswitch.id,
                            token : self.token
                        } 
                    }
                }
            };                                

            aswitch.edit =
            {
                id: 'switch_' + ijx + '_edit',
                onClick: {
                    type: 'emit',
                    message: 'callMethod',
                    data: 
                    {
                        endpoint: 'audio_interface/configured_sinks',
                        method: 'editSwitch',
                        data: 
                        {
                            id: aswitch.id,
                            token : self.token
                        }                                
                    }
                }
            }

            aswitch.save =
            {
                id: 'switch_' + ijx + '_save',
                onClick: {
                    type: 'emit',
                    message: 'callMethod',
                    data: {
                        endpoint: 'audio_interface/configured_sinks',
                        method: 'saveSwitch',
                        data: {
                            token: self.token,
                            id : element.id,
                            name: element.name,
                            ip: element.ip,
                            mac:    element.mac,
                            enabled: element.enabled,
                            on: element.on,
                            status: element.status
                        }                                    
                    }
                }
            }
        }
        
        section.add = {
            id:"switch_add",
            onClick:{
                type:'emit',
                message:'callMethod',
                data:{
                    endpoint:'audio_interface/configured_sinks',
                    method:'addSwitch',
                    data:{
                        token: self.token
                    }
                }
            }
        };
    }                                 
}

configuredSinks.prototype.getUIConfig = function(fullScan) {
    var defer = libQ.defer();
    var self = this;

    var lang_code = self.commandRouter.sharedVars.get('language_code');
    self.commandRouter.i18nJson(__dirname + '/i18n/strings_' + lang_code + '.json',
    __dirname + '/i18n/strings_en.json',
    __dirname + '/UIConfig.json')
    .then(async function (uiconf) {
        
        var configs = undefined;
        try
        {
            var dat = fs.readFileSync(__dirname + '/config.json',{encoding:'utf8', flag:'r'});
            if (dat === '')
            {                            
            }                   
            else
            {
                configs = JSON.parse(dat);
            }      
        }
        catch (err)
        {
        }

        if (configs == undefined)
        {
            defer.reject(new Error());
        }
        else
        {       
            var scan = true; 
            if ((fullScan != undefined) && (!fullScan))
            {
                scan = false;
            }

            // uiconf should now contain the loaded config.
            // Process switches.  
            for (var idx = 0; idx < uiconf.sections.length; idx++) 
            {
                var section = uiconf.sections[idx];        
                if (section.id === "switches_definitions")
                {
                    await self.getSwitches(configs, section, scan);
                }
                else if (section.id === "speakers_definitions")
                {
                    await self.getSpeakers(configs, section, scan);
                }
                else if (section.id === "zone_definitions")
                {
                    await self.getZones(configs, section, scan);
                }
            } 
            
            uiconf.cancel = {
                id:"configured_sinks_cancel_add_edit",
                onClick:{
                    type:'emit',
                    message:'callMethod',
                    data:{
                        endpoint:'audio_interface/configured_sinks',
                        method:'cancelAddEdit',
                        data:{
                            token:self.token
                        }
                    }
                }
            };

            uiconf.refresh = {
                id:"configured_sinks_refresh",
                onClick:{
                    type:'emit',
                    message:'callMethod',
                    data:{
                        endpoint:'audio_interface/configured_sinks',
                        method:'refresh',
                        data:{
                            token:self.token
                        }
                    }
                }
            };

            if (scan)
            {
                try
                {
                    fs.writeFileSync(__dirname + '/config.json', JSON.stringify(configs));
                } 
                catch(err)
                {
                    console.log(err.message);                    
                } 
            }
            
            var str = JSON.stringify(uiconf);
            self.configuration = JSON.parse(str);      
            defer.resolve(uiconf);
        }
    })    
    .fail(function (e) 
    {
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

configuredSinks.prototype.deleteSwitch = function(node) {
    var self = this;
    if ((node == undefined) || (node.id == undefined) || (node.token == undefined) || (node.token != self.token))
    {
        return;
    }

    self.token += 1;
    var configs = undefined;
    try
    {
        var dat = fs.readFileSync(__dirname + '/config.json',{encoding:'utf8', flag:'r'});
        if (dat !== '')
        {         
            configs = JSON.parse(dat);                   
        }            
    }
    catch (err)
    {
        console.log(err.message);
        self.commandRouter.broadcastToastMessage('error', 'Config Read Error', err.message);
        return;
    }

    if (configs != undefined)
    {
        var switches = [];
        configs.switches.forEach(aswitch => {
            if (aswitch.id != node.id)
            {
                switches.push(aswitch);
            }
        });

        configs.switches = switches;
        configs.speakers.forEach(speaker => {
            if (speaker.switch == node.id)
            {
                speaker.switch = -1;
            }
        });
         
        try
        {
            fs.writeFileSync(__dirname + '/config.json', JSON.stringify(configs));
        } 
        catch(err)
        {
            console.log(err.message);
            self.commandRouter.broadcastToastMessage('error', 'Config Write Error', err.message);
            return;
        } 
        
        self.commandRouter.broadcastMessage('showBusy', {});
        // New switch has been written.
        self.pushLatest('Switch deleted!');        
        return;
    }
    else
    {
        self.commandRouter.broadcastToastMessage('error', 'Config Read Error', 'Failed to read the config file');
        return;
    }
};

configuredSinks.prototype.editSwitch = function(node) {
    var self = this;
    if ((node == undefined) || (node.id == undefined) || (node.token == undefined) || (node.token != self.token))
    {
        return;
    }

    self.token += 1;    
    var response = self.getUIConfig(false);
    response.then(function(uiconf){
        if ((node.id != undefined) && (node.id === parseInt(node.id, 10)))
        {
            uiconf.sections.forEach(section => {
                if (section.id === "switches_definitions")
                {
                    section.inAddMode = false; 
                    section.inEditSwitch = node.id;
                    section.inEditMode = true;                    
                }
            });
        }

        self.commandRouter.broadcastMessage('pushUiConfig', uiconf);
    });             
};

configuredSinks.prototype.cancelAddEdit = function(node) {
    var self = this; 
    if ((node == undefined) || (node.token == undefined) || (node.token != self.token))
    {
        return;
    }

    self.token += 1;
    try
    {
        self.commandRouter.broadcastMessage('showBusy', {});
        var response = self.getUIConfig(false);
        response.then(function(uiconf){
            self.commandRouter.broadcastMessage('pushUiConfig', uiconf);            
        }).then(function(){
            self.commandRouter.broadcastMessage('hideBusy', {});
        });
    }
    catch (error)
    {
        console.log(error.message);
    }              
};

configuredSinks.prototype.refresh = function(node) {
    var self = this; 
    if ((node == undefined) || (node.token == undefined) || (node.token != self.token))
    {
        return;
    }

    self.token += 1;
    self.commandRouter.broadcastMessage('showBusy', {}); 
    return self.pushLatest();
};

configuredSinks.prototype.pushLatest = function(msg) {
    var self = this; 
    var defer = libQ.defer();   
    try
    {
        var resolve = self.getUIConfig();
        if (resolve)
        {
            if (msg != undefined)
            {
                resolve.then(function(uiconf)
                {
                    self.commandRouter.broadcastMessage('pushUiConfig', uiconf);                                
                }).then(function()
                {
                    self.commandRouter.broadcastMessage('hideBusy', {});                    
                }).then(function()
                {                    
                    self.commandRouter.broadcastToastMessage('success', 'Success', msg);
                    defer.resolve();    
                });
            }
            else
            {
                resolve.then(function(uiconf)
                {
                    self.commandRouter.broadcastMessage('pushUiConfig', uiconf); 
                               
                })
                .then(function()
                {
                    self.commandRouter.broadcastMessage('hideBusy', {});
                    defer.resolve();
                });
            }
        }  
        else
        {
            defer.reject(new Error());
        }      
    }
    catch (error)
    {
        console.log(error.message);   
        defer.reject(new Error());     
    } 
    
    return defer.promise;
};

configuredSinks.prototype.addSwitch = async function(node) {
    var self = this; 
    if ((node == undefined) || (node.token == undefined) || (node.token != self.token))
    {
        return;
    }

    self.token += 1;
    try
    {
        var response = self.getUIConfig(false);
        response.then(function(uiconf){
            uiconf.sections.forEach(section => {
                if (section.id === "switches_definitions")
                {
                    section.inAddMode = true; 
                    section.inEditSwitch = -1;
                    section.inEditMode = false;
                    section.saveNew = {
                        id:"switch_saveNew",
                        onClick:{
                            type:'emit',
                            message:'callMethod',
                            data:{
                                endpoint:'audio_interface/configured_sinks',
                                method:'saveNewSwitch',
                                data:{
                                    token: self.token,
                                    id : -1,
                                    name: "",
                                    ip:"",
                                    mac:"",
                                    enabled:false,
                                    on:false,
                                    status:-1
                                }
                            }
                        }
                    }       
                }
            });
            
            self.commandRouter.broadcastMessage('pushUiConfig', uiconf);
        });
    }
    catch(error)
    {
        console.log(error.message);
    }              
};

configuredSinks.prototype.saveNewSwitch = function(switchItem) {
    var self = this;
    if ((switchItem == undefined) || (switchItem.id == undefined) || (switchItem.token == undefined) || (switchItem.token != self.token))
    {
        return;
    }

    self.token += 1;    
    var errMsg = '';
    self.commandRouter.broadcastMessage('showBusy', {});
    var uiconf = self.configuration; 
    {   
        if ((switchItem.name != undefined) && (switchItem.name.trim().length >= 5) && (switchItem.name.trim().length <= 30))
        {           
            var matched = false;
            uiconf.sections.forEach(section => {
                if (section.id === "switches_definitions")
                {
                    section.content.forEach(element => {
                        if (element.name === switchItem.name.trim())
                        {
                            matched = true;
                        }
                    });                
                }
            });

            if (matched)
            {
                errMsg += 'Name is not unique.<br />';
            }
        }
        else
        {
            errMsg += 'Name must be between 5 and 30 characters.<br />';       
        }

        if (!isIP.v4(switchItem.ip.trim()))
        {
            errMsg += 'IP is not valid ipv4 address.<br />';                
        }
        else
        {
            var matched = false;
            uiconf.sections.forEach(section => {
                if (section.id === "switches_definitions")
                {
                    section.content.forEach(element => {
                        if (element.ip === switchItem.ip.trim())
                        {
                            matched = true;
                        }
                    });                
                }
            });

            if (matched)
            {
                errMsg += 'IP is already assigned.<br />';
            }
        }

        var regex = /^([0-9A-Fa-f]{2}[:-]?){5}([0-9A-Fa-f]{2})$/;
        if (!regex.test(switchItem.mac))
        {
            errMsg += 'MAC is not valid.<br />';
        }
        else{
            var matched = false;
            uiconf.sections.forEach(section => {
                if (section.id === "switches_definitions")
                {
                    section.content.forEach(element => {
                        if (element.mac === switchItem.mac.trim())
                        {
                            matched = true;
                        }
                    });                
                }
            });

            if (matched)
            {
                errMsg += 'MAC is already assigned.<br />';
            }
        }

        if (errMsg !== '')
        {
            errMsg = '<div>' + errMsg + '</div>'            
            try
            {
                var response = self.getUIConfig(false);
                response.then(function(confInfo){
                    confInfo.sections.forEach(section => {
                        if (section.id === "switches_definitions")
                        {
                            section.inAddMode = true; 
                            section.inEditSwitch = -1;
                            section.inEditMode = false;
                            switchItem.token = this.token;
                            section.saveNew = {
                                id:"switch_saveNew",
                                onClick:{
                                    type:'emit',
                                    message:'callMethod',
                                    data:{
                                        endpoint:'audio_interface/configured_sinks',
                                        method:'saveNewSwitch',
                                        data: switchItem
                                    }
                                }
                            }            
                        }
                    });
                    self.commandRouter.broadcastMessage('pushUiConfig', confInfo);
                }).then(function(){
                    self.commandRouter.broadcastMessage('hideBusy', {});
                    self.commandRouter.broadcastToastMessage('error', 'Input Error', errMsg);
                });
            }
            catch(error)
            {
                self.commandRouter.broadcastMessage('hideBusy', {});
                console.log(error.message);
            }
            
            return;
        }
    }

    // All checks done, the input is valid..
    var configs = undefined;
    try
    {
        var dat = fs.readFileSync(__dirname + '/config.json',{encoding:'utf8', flag:'r'});
        if (dat !== '')
        {         
            configs = JSON.parse(dat);                   
        }            
    }
    catch (err)
    {
        console.log(err.message);
        self.commandRouter.broadcastMessage('hideBusy', {});
        self.commandRouter.broadcastToastMessage('error', 'Config Read Error', err.message);
        return;
    }

    if (configs != undefined)
    {
        switchItem.id = configs.indices.switches;
        configs.indices.switches += 1;

        switchItem.name = switchItem.name.trim();
        switchItem.ip = switchItem.ip.trim();
        switchItem.mac = switchItem.mac.trim();
        var sw = {
            id : switchItem.id,
            name: switchItem.name,
            ip: switchItem.ip,
            mac: switchItem.mac,
            enabled: false,
            on: false,
            status: -1
        };

        configs.switches.push(sw);    
        try
        {
            fs.writeFileSync(__dirname + '/config.json', JSON.stringify(configs));
        } 
        catch(err)
        {
            console.log(err.message);
            self.commandRouter.broadcastMessage('hideBusy', {});
            self.commandRouter.broadcastToastMessage('error', 'Config Write Error', err.message);
            return;
        } 
        
        // New switch has been written.
        self.pushLatest('New switch added!');        
        return;
    }
    else
    {
        self.commandRouter.broadcastToastMessage('error', 'Config Read Error', 'Failed to read the config file');
        return;
    }
};

configuredSinks.prototype.saveSwitch = function(switchItem) {
    var self = this;
    if ((switchItem == undefined) || (switchItem.id == undefined) || (switchItem.token == undefined) || (switchItem.token != self.token))
    {
        return;
    }

    self.token += 1; 
    self.commandRouter.broadcastMessage('showBusy', {});
    var errMsg = '';
    var uiconf = self.configuration; 
    {   
        if ((switchItem.name != undefined) && (switchItem.name.trim().length >= 5) && (switchItem.name.trim().length <= 30))
        {           
            var matched = false;
            uiconf.sections.forEach(section => {
                if (section.id === "switches_definitions")
                {
                    section.content.forEach(element => {
                        if ((element.name === switchItem.name.trim()) && (element.id != switchItem.id))
                        {
                            matched = true;
                        }
                    });                
                }
            });

            if (matched)
            {
                errMsg += 'Name is not unique.<br />';
            }
        }
        else
        {
            errMsg += 'Name must be between 5 and 30 characters.<br />';       
        }

        if (!isIP.v4(switchItem.ip.trim()))
        {
            errMsg += 'IP is not valid ipv4 address.<br />';                
        }
        else
        {
            var matched = false;
            uiconf.sections.forEach(section => {
                if (section.id === "switches_definitions")
                {
                    section.content.forEach(element => {
                        if ((element.ip === switchItem.ip.trim()) && (element.id != switchItem.id))
                        {
                            matched = true;
                        }
                    });                
                }
            });

            if (matched)
            {
                errMsg += 'IP is already assigned.<br />';
            }
        }

        var regex = /^([0-9A-Fa-f]{2}[:-]?){5}([0-9A-Fa-f]{2})$/;
        if (!regex.test(switchItem.mac))
        {
            errMsg += 'MAC is not valid.<br />';
        }
        else{
            var matched = false;
            uiconf.sections.forEach(section => {
                if (section.id === "switches_definitions")
                {
                    section.content.forEach(element => {
                        if ((element.mac === switchItem.mac.trim()) && (element.id != switchItem.id))
                        {
                            matched = true;
                        }
                    });                
                }
            });

            if (matched)
            {
                errMsg += 'MAC is already assigned.<br />';
            }
        }

        if (errMsg !== '')
        {
            errMsg = '<div>' + errMsg + '</div>'
            try
            {
                var response = self.getUIConfig(false);
                response.then(function(confInfo){
                    confInfo.sections.forEach(section => {
                        if (section.id === "switches_definitions")
                        {
                            section.inAddMode = false; 
                            section.inEditSwitch = switchItem.id;
                            section.inEditMode = true;
                            switchItem.token = this.token;
                            section.content.forEach(aswitch =>{
                                if (aswitch.id == switchItem.id)
                                {
                                    aswitch.save.onClick.data.data = switchItem;
                                }
                            });
                        }
                    });
                    self.commandRouter.broadcastMessage('pushUiConfig', confInfo);
                }).then(function(){
                    self.commandRouter.broadcastMessage('hideBusy', {});
                    self.commandRouter.broadcastToastMessage('error', 'Input Error', errMsg);
                });
            }
            catch(error)
            {
                self.commandRouter.broadcastMessage('hideBusy', {});
                console.log(error.message);
            }

            return;
        }
    }
    
    // All checks done, the input is valid..
    var configs = undefined;
    try
    {
        var dat = fs.readFileSync(__dirname + '/config.json',{encoding:'utf8', flag:'r'});
        if (dat !== '')
        {         
            configs = JSON.parse(dat);                   
        }            
    }
    catch (err)
    {
        console.log(err.message);
        self.commandRouter.broadcastMessage('hideBusy', {});
        self.commandRouter.broadcastToastMessage('error', 'Config Read Error', err.message);
        return;
    }

    if (configs != undefined)
    {
        configs.switches.forEach(aswitch => {
            if (aswitch.id == switchItem.id)
            {
                aswitch.name = switchItem.name.trim();
                aswitch.ip = switchItem.ip.trim();
                aswitch.mac = switchItem.mac.trim();
                aswitch.enabled = switchItem.enabled;
            }
        });
         
        try
        {
            fs.writeFileSync(__dirname + '/config.json', JSON.stringify(configs));
        } 
        catch(err)
        {
            console.log(err.message);
            self.commandRouter.broadcastMessage('hideBusy', {});
            self.commandRouter.broadcastToastMessage('error', 'Config Write Error', err.message);
            return;
        } 
        
        // New switch has been written.
        self.pushLatest('Switch Saved!');        
        return;
    }
    else
    {
        self.commandRouter.broadcastToastMessage('error', 'Config Read Error', 'Failed to read the config file');
        return;
    }
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