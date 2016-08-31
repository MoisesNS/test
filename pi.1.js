require('events').EventEmitter.prototype._maxListeners = 100;
var config = require('./config');
var http = require('http');
var net = require('net');
var mqtt = require("mqtt");
var shell = require('shelljs');
//var mysql = require('mysql');
var _ = require('underscore');
var serialPort = require("serialport");
//var omx = require('omxdirector');
///var mqttClientId = 'nutsoftPi_' + Math.random().toString(16).substr(2, 8);
var getIP = require('external-ip')();
var os = require("os");
var idDevice = config.id_device;
var idStore = config.id_store;
var appID = config.app_uuid;
var lastCallback = "";
var mqttClientId = 'nutsoftPi_'+appID+idDevice;
var printLabelData="";
var arpscanner = require('arpscan');

var labelPrinterUsbPort;
var labelPrinterHost = '192.168.1.3';
var labelPrinterPort = 9100;
//var mqttBroker = 'ws://104.155.53.249:3000/';

var mqttUsername = config.username;
var mqttPassword = config.password;
var mqttBroker = 'ws://'+config.server+':'+config.port+'/';
var lastWill = {
    topic : appID+"/presence/offline",
    payload : JSON.stringify({id_gateway:idDevice.toString(),online:0}),
    qos : 1
};
var deviceData = {};
////////

/////////


var mqttOptions = {
        reconnectPeriod: 1000,
        connectTimeout: 3 * 1000,
        keepalive: 2,
        clientId: mqttClientId,
        clean : true,
        will : lastWill,
        username : mqttUsername,
        password : mqttPassword
    };


var mqttClient;// = mqtt.connect(mqttBroker,mqttOptions);
var piTopic = appID+"/"+idStore+"/"+idDevice;
var brotherTopic = appID+"/presence";

var labelProductTemplateKey = 1;
var senderTemplateKey = 3;
var toCollectTemplateKey = 2;


var printTopic = piTopic+"/print1";
var templateTopic = printTopic+"/template";
var pdfTopic = printTopic+"/pdf";
var shellTopic = piTopic+"/shell";
var radioTopic = piTopic+"/radio";
var signageTopic = piTopic+"/signage";
//var signageTopic = "0c89c0e5-9bb9-11e5-bb98-42010af00002/1/1/signage";

var piServerIP;
var localDevices;
var usbDevices = [];

//var printLabelTopic = '0c89c0e5-9bb9-11e5-bb98-42010af00002/1/2/print_label_product';

var topicList = {
      //  '0c89c0e5-9bb9-11e5-bb98-42010af00002/4/checkDevices' : 1,
    };
console.log(appID+'/'+idDevice+'/search_label_printer');
topicList[appID+'/'+idDevice+'/search_label_printer'] =1;
topicList[appID+'/'+idDevice+'/print_label_product'] =1;
topicList[appID+'/'+idDevice+'/print_escpos_ticket'] =1;
topicList[appID+'/'+idDevice] =1;

var server = http.createServer(function(req, res) {
                res.writeHead(200);
                res.end('I am nutsoftPi!');
            });

server.listen(8888);


init();

function init(){
  //  resetDevicesDb();
    getIp();
    connectMqtt();
   // getDbInfo();
    //subscribe(topicList);
   // checkNetworkDevices();
//    checkUsb();
}

function connectMqtt(){
    mqttClient = mqtt.connect(mqttBroker,mqttOptions);
    mqttClient.on('connect', function (connack) {
        console.log("-> Connected to Host: "+mqttBroker+" | Client ID: "+mqttClientId);
        if(!connack.sessionPresent){
            console.log("No Session, initiating "+new Date());
            var data = {};
            subscribe(topicList);
            getIP(function (err, externalIP) {
                if (err) {
                    throw err;
                }
                var model = os.cpus();
                var arch = os.arch();
                var platform = os.platform();
                var interfaces = os.networkInterfaces();

                console.log({model:model[0].model,interfaces:interfaces.eth0});
                data.id_gateway =idDevice.toString();
                data.ipv4_external=externalIP;
                data.hostname = os.hostname();
                data.model = model[0].model;
                data.online=1;
                deviceData = data;
                deviceIp(null,function(netDevs){


                    data.network = netDevs;
                    deviceData = data;
                    mqttClient.publish(appID+'/presence/online',JSON.stringify(data));

                    console.log(appID+'/presence/online');
                });

            });
        }
        else{
            console.log("Session present, confirming presence "+new Date());
            deviceIp(null,function(netDevs){
                deviceData.network = netDevs;
                mqttClient.publish(appID+'/presence/online',JSON.stringify(deviceData));

                console.log(appID+'/presence/online');
            });
        }
    });
}


function connectMqtt2(){
    mqttClient = mqtt.connect(mqttBroker,mqttOptions);
    mqttClient.on('connect', function (connack) {
        console.log("-> Connected to Host: "+mqttBroker+" | Client ID: "+mqttClientId);
 //       if(!connack.sessionPresent){
            console.log("No Session, initiating "+new Date());
            var data = {};
            subscribe(topicList,1);

            getInfo();

       /* }
        else{
            console.log("Session present, confirming presence "+new Date());
            deviceIp(null,function(netDevs){
                deviceData.network = netDevs;
                mqttClient.publish(appID+'/presence/online',JSON.stringify(deviceData));

                console.log(appID+'/presence/online');
            });
        }*/
    });
}

function getInfo(){
    console.log("getInfo");
     var data = {};
    getIP(function (err, externalIP) {
         console.log("getIp");
                if (err) {
                    throw err;
                }
                var model = os.cpus();
                var arch = os.arch();
                var platform = os.platform();
                var interfaces = os.networkInterfaces();

                console.log({model:model[0].model,interfaces:interfaces.eth0});
                data.id_gateway =idDevice.toString();
                data.ipv4_external=externalIP;
                data.hostname = os.hostname();
                data.model = model[0].model;
                data.online=1;
                deviceData = data;
                deviceIp(null,function(netDevs){
                    data.network = netDevs;
                    deviceData = data;
                    mqttClient.publish(appID+'/presence/online',JSON.stringify(data));

                    console.log(appID+'/presence/online');
                });

            });

}

function processMsg(topicStr,msg){

    console.log("Process : Topic : "+topicStr+", Message : "+msg);
    var topic = topicStr.split("/");//var piTopic = "appID/storeID/piID" == topic[0]+""+topic[1]
    var cb = msg.toString().split(';');
  //  publishCb(topicStr+"/","Print job completed in moments");

 /*   if(cb[0] != lastCallback){
        lastCallback = cb[0];
*/
    	var data = JSON.parse(msg);
    	console.log({data:data});
    	switch(data.type) {
    		case "search_label_printer":
    			searchLabelPrinter(topicStr,data);
    			break;
        	case "print_label_product" :
        		printProductLabelRaster(topicStr,data);
//        		printLabelProduct(topicStr,data);
    			break;
    		case "checkDevices":
                checkDevices();
        	    break;
    		case "print_escpos_ticket":
                printEscposTicket(topicStr,data);
        	    break;
    		case "shell" :
                //cli(msg);
        	    break;
    		case "radio" :
        	    radio(topicStr,data);
        	    break;
        	case "signage" :
        	   // signage(msg);
        	    break;
        	default:
        	    //log(topic,msg);
       		    break;
    	}
 /*   }
    else{

    }*/
}

function printEscposTicket(topicStr,data){
	var SerialPort = require("serialport").SerialPort;
	console.log({topicStr:topicStr,data:data});
	var port = new SerialPort("/dev/ttyUSB0", {
	    baudrate: 9600,
	    dataBits: 8,
	    stopBits: 1
	}, false);
    port.open(function (error) {
        if(error) return console.log({err:-1,result:"error"}); //error opening port
        else {
            port.write(data.data, function(err, results) {
                if(error) return cb({err:-2,result:"error"}); //error writing to printer
                console.log({data:results,result:"ok"});
            });
        }
    });



}




function printLabelProduct(topicStr,data){
	console.log({topicStr:topicStr,data:data});
    console.log("printLabelProduct");

    var labelQt = data.qt;

    printLabelData = "";
    printLabelData += template_mode();
    printLabelData += '^'+'L'+'S'+'0'+'0'+'1';

    printLabelData += template_init();
//    printLabelData += '^'+'L'+'S'+'0'+'1'+'0';
    printLabelData += '^'+'L'+'S'+'0'+'0'+'1';

    printLabelData += choose_template(1);
   // printLabelData +='^'+'C'+'N'+'0'+'0'+'2'; nr copies
   console.log({template:choose_template(1)});
  //  printLabelData += page_length(168); //1mm->12dots
   printLabelData += '^'+'L'+'S'+'0'+'0'+'1';


   // printLabelData += template_operation("cut");
    select_and_insert('product_name',data.name);
    select_and_insert('barcode', Number(data.code));
    select_and_insert('tax_text',"Iva 23%");

 /*   select_and_insert('product_name',param[1]);
    select_and_insert('price',param[2]);
    select_and_insert('barcode', Number(169525));
    select_and_insert('tax_text',param[4]);
*/

  /*  if(param){
        _.each(param, function(p) {
            console.log("params");
            console.log("product_name",p);
           select_and_insert(p.key,p.val);
        });
    }*/
//printLabelData +=String.fromCharCode(27)+"iX32"+String.fromCharCode(2)+String.fromCharCode(0);
//printLabelData += '^'+'C'+'H'+'0';
printLabelData += '2^'+'C'+'R'+'2';

    printLabelData += template_print();

    console.log('printLabelData');
    console.log(printLabelData);

    var client = new net.Socket();
    client.connect(labelPrinterPort, labelPrinterHost, function() {
        console.log('printLabelData CONNECTED TO: ' + labelPrinterHost + ':' + labelPrinterPort);
        console.log("printLabelData printLabel -> "+printLabelData);
        for(var i= 0; i < labelQt; i++){
            client.write(printLabelData);
        }
     //   client.end();

    });
    client.on('data', function(data) {
    	  console.log({data:data.toString()});
    	  client.end();
    	});
    client.on('close', function() {
        console.log('Connection closed');
        publishCb(topicStr+"/"+callBack,"Print job completed in moments");

    });

    //printTemplate(labelProductTemplateKey,params);
}
function printProductLabelRaster(){
	console.log("raster printer");
	var printLabelData = "";
    printLabelData = "";
    printLabelData += '\x1B\x69\x61\x01'; // setMode
//    printLabelData += '\x00'* 200; //set_clear_command_buffer
    printLabelData += '\x1B\x40'; //init
    printLabelData += '\x1B\x69\x61\x01'; // setMode
  //  printLabelData +=set_autocut(true);
  //  printLabelData +=set_cut_every(1);
    printLabelData + '\x1A';
    var mtype = 0x0A;
    var mwidth = 62;
    var mlength = 0;
    console.log({printLabelData:printLabelData, labelPrinterHost:labelPrinterHost});
    var client = new net.Socket();
    client.connect(labelPrinterPort, labelPrinterHost, function() {
        console.log('printLabelData CONNECTED TO: ' + labelPrinterHost + ':' + labelPrinterPort);
        console.log("printLabelData printLabel -> "+printLabelData);
        for(var i= 0; i < 1; i++){
            client.write(printLabelData);

        }
     //   client.end();

    });
  /*  client.on('data', (data) => {
    	  console.log({data:data});
    	  client.end();
    	});*/
    client.on('close', function(d) {
    	console.log({d:d});
        console.log('Connection closed');
        publishCb(topicStr+"/"+callBack,"Print job completed in moments");

    });

}
function searchLabelPrinter(topicStr,data){
arpscanner(function(err,d){
		console.log({err:err,data:d});
		if(err) d.result="error";
		else{
			var result = {};
			result.res="ok";
			result.data=d;
			console.log({result:result});
			mqttClient.publish(topicStr+"/"+data.token, JSON.stringify(result));
		}
	});
}



function checkDevices(){
    _.each(localDevices, function(d) {
        mqttClient.publish(appID+'/presence/offline', d.id_device.toString());
    });
    usbDevices = [];
    resetDevicesDb();
    getIp();
    checkNetworkDevices();
    checkUsb();
}

function checkNetworkDevices(){
    console.log("checkNetworkDevices");
    var devIps = [];
    var tmpInfo = [];

    cliCb("sudo arp-scan -l --interface=eth0",function(cb){
console.log({cb1:cb});
        var tmp1 = cb.output.toString().split("(http://www.nta-monitor.com/tools/arp-scan/)");
        var tmp2 = tmp1[1].split("\n\n");
        var tmp3 = tmp2[0].split("\t");

        _.each(tmp3, function(a) {
            var tmpItem = a.split('\n');
            _.each(tmpItem, function(item) {
                if(item != ""){
                    tmpInfo.push(item);
                }
            });
        });
        devIps = splitArray(tmpInfo,3);
        updateNetworkDevices(devIps);
    });
}

function updateNetworkDevices(ips){

    _.each(localDevices, function(d) {
        if(d.id_function === 1){
            queryDb("UPDATE device SET ip = '"+piServerIP+"', online = 1 WHERE id_device = "+d.id_device);
            mqttClient.publish(appID+'/presence/online', d.id_device+";ip;"+piServerIP);
        }
        _.each(ips, function(dev) {
            if(d.mac.toLowerCase() == dev[1]){
                d.ip = dev[0];
                queryDb("UPDATE device SET ip = '"+dev[0]+"', online = 1 WHERE id_device = "+d.id_device);
                mqttClient.publish(appID+'/presence/online', d.id_device+";ip;"+d.ip);
            }
        });
    });
}

function updateUSBDevices(usbDev){
    _.each(localDevices, function(d) {
        if(d.usb === 1){
             _.each(usbDev, function(dev) {
                if(d.serial == dev[1]){
                    d.online = 1;
                    console.log("printer Online");
                   // queryDb("UPDATE device SET online = 1 WHERE id_device = "+d.id_device);
                    mqttClient.publish(appID+'/presence/online', d.id_device+";usb;"+dev[2]);
                }
                /*else{
                    if(d.online === 1){
                        queryDb("UPDATE device SET online = 0 WHERE id_device = "+d.id_device);
                        mqttClient.publish(appID+'/presence/offline', d.id_device+";");
                    }
                }*/
            });
        }
    });
}

function checkUsb(){
    console.log("checkUsb");
    cliCb("lpinfo -v",function(cb){
//console.log(cb.output);

        var tmp1 = cb.output.toString().split("\n");
//console.log("tmp1--------------------------");
        //console.log(JSON.stringify(tmp1));

        tmp1.forEach(function(item) {
            var it = undefined;
            var tmp2 = item.split("direct usb://");
            if(tmp2[1] != undefined){

                console.log("tmp1");
                console.log(JSON.stringify(tmp2));

                it = tmp2[1].split("?serial=");
                it.push(item);
                console.log("it in");
                console.log(JSON.stringify(it));
                usbDevices.push(it);

            }
        });
        console.log('Devices: ', JSON.stringify(usbDevices));
        updateUSBDevices(usbDevices);

    });
}

function splitArray(arr, n) {
    var res = [];
    while (arr.length) {
        res.push(arr.splice(0, n));
    }
    return res;
}

function resetDevicesDb(){
    var queryString = 'UPDATE device SET online = 0, ip = "" WHERE id_device > 0';
    var queryString2 = 'UPDATE device SET usb_port = "" WHERE id_device > 0 AND usb = 1';
    queryDb(queryString);
    queryDb(queryString2);
}

function getDbInfo(){
    var connection = mysql.createConnection(dbOptions);
    connection.connect();
    var queryString = 'SELECT * FROM device d LEFT JOIN device_type t ON d.id_type = t.id_type LEFT JOIN device_function f ON d.id_function = f.id_function';
    connection.query(queryString, function(err, rows, fields) {
        if (err) throw err;
        localDevices = rows;
        for (var i in rows) {
           //console.log('Devices: ', JSON.stringify(rows[i]));
        }
        //checkNetworkDevices();
    });
    connection.end();
}

function getIp(){
    cliCb("ifconfig",function(cb){
        var tmp1 = cb.output.toString().split("inet addr:");
        var tmp2 = tmp1[1].split(" ");
        console.log("ip _> "+tmp2[0]);
        piServerIP = tmp2[0];
        return tmp2[0];
    });
}

function queryDb(queryString){
var connection = mysql.createConnection(dbOptions);
    connection.connect();
    connection.query(queryString, function(err, rows, fields) {
        if (err) throw err;
        return rows;
    });
    connection.end();
}

function signage(message){
    console.log("Sig msg -> "+message);
    var msg = message.toString().split("_");

    if(msg[0] === 'playlist'){
        updatePlaylist(msg[1],msg[2]);
    }
}

function updatePlaylist(mediaGroup,timestamp){

    cliCb("wget -O SignagePlaylist https://storage.googleapis.com/nspub/"+appID+"/digitalSignage/PlaylistGroup_"+mediaGroup+"_"+appID+"_"+timestamp,function(cb){
        cliCb("sudo killall -9 omxplayer.bin",function(cb2){
            //stopVideo();

            playSignageList();
        });
    });
}

function playSignageList(){
    //cli("yt_playList.sh 'youtubeList'");
    cli("yt_playList.sh 'SignagePlaylist'");
}

function playSignageListLoop(){
  //  yt_playList.sh 'ytList'
    cliCb("yt_playList.sh 'SignagePlaylist'",function(cb){
        playSignageList();
    });
}

function playVideo(){


   // cli("omxplayer `youtube-dl -g https://www.youtube.com/watch?v=FVDjHszbdO8`");
   cli("omxplayer `youtube-dl -g https://www.youtube.com/watch?v=li4MlQfuPqo`");


   // omxplayer `youtube-dl -g https://www.youtube.com/watch?v=mifX_WnEv8E`

    //var filename = "";
    //omx.play('https://www.youtube.com/watch?v=FVDjHszbdO8');
    //omx.start(filename);
}

function pauseVideo(){
    omx.pause();
}

function stopVideo(){
    omx.quit();
}


function subList(){


    //subscribe(piTopic);
    //subscribe(signageTopic);
    //subscribe(appID+"/1/2/print_product_label");
    subscribe('0c89c0e5-9bb9-11e5-bb98-42010af00002/1/2/print_label_product');
    //subscribe(templateTopic);
    //subscribe(pdfTopic);
    //subscribe(shellTopic);
    //subscribe(radioTopic);
}


/*******************************************
 *
 *                       Shell Methods
 *
 ********************************************/


function cli(data){
    shell.exec(data, function(code, output) {
        console.log('Shell Ctrl Exit code:', code);
        console.log('Program output:', output);
        //var msg = 'code:'+code+',output:'+output;
        //publish(shellTopic,code);
        return ({code:code,output:output});
    });
}


function cli2(data,cb){
    shell.exec(data, function(code, output) {
        console.log('Shell Ctrl Exit code:', code);
        console.log('Program output:', output);
        //var msg = 'code:'+code+',output:'+output;
        //publish(shellTopic,code);
        cb({code:code,output:output});
    });
}

function cliCb(data,cb){
    shell.exec(data, function(code, output) {
        //console.log('Shell Ctrl Exit code:', code);
        //console.log('Program output:', output);
        //var msg = 'code:'+code+',output:'+output;
        //publish(shellTopic,code);
        return cb({code:code,output:output});
    });
}

 /*******************************************
 *
 *                       Pub/Sub Methods
 *
 ********************************************/
function publishCb(topic,message){
    console.log('publishCb topic -> '+topic);
    console.log('publishCb message -> '+message);
    var client2  = mqtt.connect(mqttBroker,mqttOptions);
    client2.on('connect', function () {
        //client.publish('presence', 'Store1 | Pi1 online & publishing message:\n'+message,{qos:1});
        client2.publish(topic,message,{qos:1});
        client2.end();
    });
}


function publish(topic,message){
    console.log('server publish topic -> '+topic);
    console.log('server publish message -> '+message);
    var client  = mqtt.connect(mqttBroker,mqttOptions);
    client.on('connect', function () {
        //client.publish('presence', 'Store1 | Pi1 online & publishing message:\n'+message,{qos:1});
        client.publish(topic,message,{qos:1});
        //client.end();
    });
}

function subscribe(topic,init){
    console.log('subscribe -> '+JSON.stringify(topic));
    mqttClient.subscribe(topic,{ qos: 1 });

    if(init){
        getInfo();
    }

    mqttClient.on("message", function(top, payload) {
        //console.log("Topic : "+top+"\nMessage : "+payload);
        //var topics = top.split('/');
        //console.log([topic, payload].join(" : "));
    	console.log(top);
        processMsg(top,payload);
    });
}


/*******************************************
 *
 *                       Radio Methods
 *
 ********************************************/

function radio(topic,msg){
    var token = msg.token ? msg.token.toString() : "";
    var op = msg.op;
    var url = msg.url;
    var val = msg.val;
    var msg = {};
    switch(op) {
		case "play":
			cliCb("mpc play",function(res){
                console.log("play");
                console.log({res:res});
            });
			break;
    	case "status" :
            cliCb("mpc",function(res){
                console.log("status");
                console.log({res:res});
               /* if(res.code < 1){
                    var msg1 = res.output.toString().split("olume: ");
                    if(msg1[1])
                        var msg2 = msg1[1].split("%");

                    if(msg1 && msg2){
                        msg = {
                          volume : Number(msg2[0])
                        };
                    }
                    else{
                        msg1 = res.output.toString().split("olume:");
                        msg2 = msg1[1].split("%");
                        if(msg1 && msg2){
                            msg = {
                              volume : Number(msg2[0])
                            };
                        }
                    }
                }*/
                console.log({msg:msg});
                //console.log("to publish to Topic ---------------\n"+topic+"/radio/"+token);
                mqttClient.publish(topic+"/radio/"+token,JSON.stringify(res));
            });
			break;
		case "playlist" :
            cliCb("mpc load ",function(res){
                console.log("load");
                console.log({res:res});
            });
			break;
		case "pause" :
            cliCb("mpc pause",function(res){
                console.log("pause");
                console.log({res:res});
            });
			break;
		case "refresh" :
            cli("mpc stop");
            cli("mpc play");
			break;
		case "test" :
            cliCb("mpc clear",function(res){
                console.log("res1");
                console.log({res:res});
                cliCb("mpc add "+url,function(res){
                    console.log("res2");
                    console.log({res:res});
                    cliCb("mpc play",function(res){
                        console.log("play res2");
                        console.log({res:res});
                        cliCb("mpc stop",function(res){
                             console.log("res3");
                        console.log({res:res});

                            if(res.code < 1){
                                var msg1 = res.output.toString().split("olume:");
                                if(msg1 && msg1[1])
                                    var msg2 = msg1[1].split("%");

                                if(msg1 && msg2){
                                    msg = {
                                      volume : Number(msg2[0])
                                    };
                                }

                                var msgErr = res.output.toString().split("ERROR:");

                                if(msgErr){

                                }

                                mqttClient.publish(topic+"/radio/"+token,JSON.stringify(msg));
                                /*else{
                                    msg1 = res.output.toString().split("olume:");
                                    msg2 = msg1[1].split("%");
                                    if(msg1 && msg2){
                                        msg = {
                                          volume : Number(msg2[0])
                                        };
                                    }
                                }*/
                            }
                        });
                    });
                });

            });
			break;
		case "volumeUp" :
            cliCb("mpc volume +"+val,function(res){
                console.log("volumeUp");
                console.log({res:res});

                if(res.code < 1){
                    var msg1 = res.output.toString().split("olume: ");

                    if(msg1[1])
                        var msg2 = msg1[1].split("%");
                    if(msg1 && msg2){
                        msg = {
                          volume : Number(msg2[0])
                        };
                    }
                    else{
                        msg1 = res.output.toString().split("olume:");
                        msg2 = msg1[1].split("%");
                        if(msg1 && msg2){
                            msg = {
                              volume : Number(msg2[0])
                            };
                        }
                    }
                }
                mqttClient.publish(topic+"/radio/"+token,JSON.stringify(msg));
            });
			break;
		case "volumeDown" :
            cliCb("mpc volume -"+val,function(res){
                console.log("volumeDown");
                console.log({res:res});

                if(res.code < 1){
                    var msg1 = res.output.toString().split("olume: ");
                    if(msg1[1])
                        var msg2 = msg1[1].split("%");

                    if(msg1 && msg2){
                        msg = {
                          volume : Number(msg2[0])
                        };
                    }
                }
                mqttClient.publish(topic+"/radio/"+token,JSON.stringify(msg));
            });
			break;
		case "add" :
            cliCb("mpc add "+url,function(res){
                console.log("add");
                console.log({res:res});
            });
			break;
		case "output" :
            cliCb("sudo amixer -c 0 cset numid=3 "+val,function(res){
                console.log("output");
                console.log({res:res});
            });
        case "stop" :
            cliCb("mpc stop",function(res){
                console.log("output");
                console.log({res:res});

            });
			break;
    	default:
   		    break;
	}

}

function play(radio){
    cli("mpc play "+radio);
}

function add(radioUrl){
    //mpc add mms://rdp.oninet.pt/antena1
    //cli("mpc add mms://"+radioUrl);
    cli("mpc add "+radioUrl);
}

/*******************************************
 *
 *                       Printing Methods1
 *
 ********************************************/

function print(topic,msg){

    var opt = topic.split("/");

    if(opt[3] == "ticket"){
        if(opt[4] == "template"){
            printTemplate(opt[5],msg);
        }
        if(opt[4] == "pdf"){
            printPdf(opt[5],msg);
        }
    }
}


/*
function esc_command_mode(topicStr,msg){
    console.log("printLabelProduct");
    var topic = topicStr.split("/");
    console.log("Topic -> "+topicStr+"\n"+msg);
    //var param = msg.split(';');

    var param = msg.toString().split(';');


    var labelQt = param[5];
    var callBack = param[0];

    printLabelData = "";
    printLabelData += template_mode();
    printLabelData += template_init();
    printLabelData += choose_template(1);

    select_and_insert('product_name',param[1]);
    select_and_insert('price',param[2]);
    select_and_insert('barcode', Number(param[3]));
    select_and_insert('tax_text',param[4]);
console.log({params:param});

    printLabelData += template_print();

    console.log('printLabelData');
    console.log(printLabelData);

    var client = new net.Socket();
    client.connect(labelPrinterPort, labelPrinterHost, function() {
        console.log('printLabelData CONNECTED TO: ' + labelPrinterHost + ':' + labelPrinterPort);
        console.log("printLabelData printLabel -> "+printLabelData);
        for(var i= 0; i < labelQt; i++){
            client.write(printLabelData);
        }
        client.end();

    });
    client.on('close', function() {
        console.log('Connection closed');
        publishCb(topicStr+"/"+callBack,"Print job completed in moments");

    });

    //printTemplate(labelProductTemplateKey,params);
}*/


function set_media_and_quality(rnumber){
    /*self.data += b'\x1B\x69\x7A'
    valid_flags = 0x80
    valid_flags |= (self._mtype is not None) << 1
    valid_flags |= (self._mwidth is not None) << 2
    valid_flags |= (self._mlength is not None) << 3
    valid_flags |= self._pquality << 6
    self.data += bytes([valid_flags])
    vals = [self._mtype, self._mwidth, self._mlength]
    self.data += b''.join(b'\x00' if val is None else val for val in vals)
    self.data += struct.pack('<L', rnumber)
    self.data += bytes([self.page_number == 0])
    self.data += b'\x00'*/
}
var bytes = require('bytes');
function set_autocut(autocut){
	var data ="";
    data += '\x1B\x69\x4D';
    data += bytes([autocut << 6]);
    return data;
}
function set_cut_every(n){
	var data ="";
    data += '\x1B\x69\x41';
    data += bytes([n & 0xFF]);
    return data;
}
function set_expanded_mode(){
	var data ="";
/*	var data ="";
    data += '\x1B\x69\x4B'
    flags = 0x00
    flags |= self.cut_at_end << 3
    flags |= self.dpi_600 << 6
    self.data += bytes([flags])
*/
	return data;
}
function set_compression(compression){
	var data ="";
    data += '\x4D'
    data += bytes([compression << 1]);
    return data;
}
function set_margins(self, dot){
	dot = 0x23;
	var data="";
    data += '\x1B\x69\x64';
    data += struct.pack('<H', dots)
}

function printLabelSender(topicStr,msg){
    console.log("printLabelSender");
    var topic = topicStr.split("/");
    console.log("Topic -> "+topicStr+"\n"+msg);
    //var param = msg.split(';');

    var param = msg.toString();
    //var param = ["ProdName","10,00","027131691082","IVA Inc."];/*,{key:"product_name",value:"2"}*/

    var labelQt = param;

    printLabelData = "";
    printLabelData += '\x1B\x69\x61\x01'; // setMode
    printLabelData += '\x00'* 200; //set_clear_command_buffer
    printLabelData += '\x1B\x40'; //init
    printLabelData += '\x1B\x69\x61\x01'; // setMode
    printLabelData +=set_autocut(True);
    printLabelData +=set_cut_every(1);
    printLabelData + '\x1A';
    var mtype = 0x0A;
    var mwidth = 62;
    var mlength = 0;




    var client = new net.Socket();
    client.connect(labelPrinterPort, labelPrinterHost, function() {
        console.log('printLabelData CONNECTED TO: ' + labelPrinterHost + ':' + labelPrinterPort);
        console.log("printLabelData printLabel -> "+printLabelData);
       // for(var i= 0; i < param[4]; i++){
            client.write(printLabelData);
        //}
        client.end();

    });
    client.on('close', function() {
        console.log('Connection closed');

    });

    //printTemplate(labelProductTemplateKey,params);
}

function printPdf(pdfUrl,opt){
    var url = pdfUrl ? pdfUrl : 'https://storage.googleapis.com/nspub/0c89c0e5-9bb9-11e5-bb98-42010af00002/doc/2015/12/22/0/0/FR/15678b83ccb22f.pdf';
    var file = url.split("/");

    cli2("wget "+url, function(res){
        cli2("lpr "+file[file.length-1], function(res2){
            setTimeout(function(){
                cli("rm "+file[file.length-1]);
            }, 1000);
        });

    });
}

function printTemplate(key,params,cb){
    printLabelData = "";
    printLabelData += template_mode();
    printLabelData += template_init();
    printLabelData += choose_template(key);

    if(params){
        _.each(params, function(p) {
            console.log("params");
            console.log(p.key,p.val);
           select_and_insert(p.key,p.val);
        });
    }

    printLabelData += template_print();
    var client = new net.Socket();
    client.connect(labelPrinterPort, labelPrinterHost, function() {
        console.log('CONNECTED TO: ' + labelPrinterHost + ':' + labelPrinterPort);
        console.log("printLabel -> "+printLabelData);
        client.write(printLabelData);
        client.end();
    });
    client.on('close', function() {
        console.log('Connection closed');

    });
}

/*******************************
 *
 *      Template commands
 *
 ***********************************/

function template_mode(){
//    return String.fromCharCode(27)+'i'+'a'+'3';
    return String.fromCharCode(27)+'i'+'a'+'3';
}
function template_init(){
     return String.fromCharCode(94)+String.fromCharCode(73)+String.fromCharCode(73);
}
function choose_template(number,number2){
    var n1 = Number(number)/10;
    var n2 = Number(number)%10;
    return '^TS'+'0'+'0'+number.toString();
}

function select_and_insert(name,text){
    //select_obj(name);
    //insert_into_obj(text);

    var size;
    if(text == undefined) text = "";
    size = text.length;
    var n1 = size%256;
    var n2 = size/256;

    printLabelData += '^ON'+name+String.fromCharCode(0);
    printLabelData += '^DI'+String.fromCharCode(n1)+String.fromCharCode(n2)+text;

}
function select_obj(name){
    printLabelData += '^ON'+name+String.fromCharCode(0);
}
function insert_into_obj(text){
    var size;
    if(text == undefined) text = "";
    size = text.length;
    var n1 = size%256;
    var n2 = size/256;
    printLabelData += '^DI'+String.fromCharCode(n1)+String.fromCharCode(n2)+text;
    //printLabelData += '^D'+String.fromCharCode(73)+String.fromCharCode(n1)+String.fromCharCode(n2)+text;
    console.log(printLabelData);
    //printLabelData += '^DI'+n1.toString()+n2.toString()+text;
    //return '^DI'+String.fromCharCode(n1)+String.fromCharCode(n2)+printLabelData;
}
function select_font(){
    var fonts = {
        brougham : 0,
        lettergothicbold : 1,
        brusselsbit  : 2,
        helsinkibit : 3,
        sandiego : 4,
        lettergothic : 9,
        brusselsoutline : 10,
        helsinkioutline : 11
    }
}

function template_operation(op){//Funciona ao invocar, sem necessidade de template mode
    var operation = {
        feed2start : 1,
        feedone : 2,
        cut : 3
    }
    return '^'+'O'+'P'+String.fromCharCode(op);
}
function status_request(){
    return String.fromCharCode(94)+String.fromCharCode(83)+String.fromCharCode(82);
    //return '^SR';
}
function template_print(){
    return '^'+'F'+'F';
	//   return '^'+'F';
}

function template_data(){
    return '^ID';
}
function print_start_command(command){
    var size;
    if(command == undefined) command = "";
    size = command.length;
    var n1 = size%10;
    var n2 = size/10;

    //return '^PS'+n1.toString()+n2.toString()+command;
    return '^PS'+String.fromCharCode(n1)+String.fromCharCode(n2)+command;
}
function start_trigger(type){
    //self.send('^PT'+chr(types[type]))
    var types = {
        recieved : 1,
        filled : 2,
        num_recieved : 3
    }
    return '^PT'+types[type].toString();
}

function t1(){
    printLabelData = "";
    console.log("t1");
    var templateID=1;
  //  printLabelData += template_mode();
    printLabelData += template_init();
    printLabelData += choose_template(templateID);
    printLabelData += template_operation(3);
    //printLabelData += template_printLabelData();
    //printLabelData += start_trigger('filled');
    //printLabelData += choose_template(templateID);
    //printLabelData += status_request();
    //printLabelData += '^S R';
   //printLabelData += template_operation('feed2start');
  //  printLabelData += template_operation('feedone');
    //printLabelData += choose_template(templateID);
    //printLabelData += start_trigger('filled');
   //select_and_insert('Nome','olaré');
    //select_and_insert('total','100,87');
     //select_and_insert('texto2','cobrar');
    //select_and_insert('extenso','cento e oitenta e sete');
    //printLabelData += print_start_command();
    //printLabelData += template_printLabelData();
  //  printLabelData += template_print();
    //printLabelData += template_operation('cut');
    var client = new net.Socket();
    client.connect(labelPrinterPort, labelPrinterHost, function() {
        console.log('CONNECTED TO: ' + labelPrinterHost + ':' + labelPrinterPort);
        console.log("printLabelData -> "+printLabelData);
        client.write(printLabelData);
        client.end();
    });
    client.on('data', function(data) {
        console.log('DATA: ' + data);
        // Close the client socket completely
        client.destroy();
    });
    client.on('close', function() {
        console.log('Connection closed');
    });
}

function t3(){
    printLabelData = "";
    console.log("t3");
    var templateID = 3;
    printLabelData += template_mode();
    printLabelData += template_init();
    printLabelData += choose_template(templateID);
    //printLabelData += template_printLabelData();
    //printLabelData += start_trigger('filled');
    //printLabelData += choose_template(templateID);
    //printLabelData += status_request();
    //printLabelData += '^S R';
   //printLabelData += template_operation('feed2start');
    //printLabelData += template_operation('feedone');
    //printLabelData += choose_template(templateID);
    //printLabelData += start_trigger('filled');
    //var param = [{key:"product_name",value:"ProdName"},{key:"price",value:"10,00"},{key:"barcode",value:"027131691082"},{key:"tax_text",value:"IVA Inc."}/*,{key:"product_name",value:"2"}*/];
    /*select_and_insert('product_name','ProdName');
    select_and_insert('price','10,00');
    select_and_insert('barcode','027131691082');
    select_and_insert('tax_text','IVA Inc.');*/
    //printLabelData += print_start_command();
    //printLabelData += template_printLabelData();
    printLabelData += template_print();
    //printLabelData += template_operation('cut');
    var client = new net.Socket();
    client.connect(labelPrinterPort, labelPrinterHost, function() {
        console.log('CONNECTED TO: ' + labelPrinterHost + ':' + labelPrinterPort);
        console.log("printLabelData -> "+printLabelData);
        client.write(printLabelData);
        client.end();
    });
    client.on('data', function(data) {
        console.log('DATA: ' + data);
        // Close the client socket completely
        client.destroy();
    });
    client.on('close', function() {
        console.log('Connection closed');
    });
}

function t2(){
    printLabelData = "";
    console.log("t2");
    var templateID = 2;
    printLabelData += template_mode();
    printLabelData += template_init();
    printLabelData += choose_template(templateID);
    //printLabelData += template_printLabelData();
    //printLabelData += start_trigger('filled');
    //printLabelData += choose_template(templateID);
    //printLabelData += status_request();
    //printLabelData += '^S R';
   //printLabelData += template_operation('feed2start');
    //printLabelData += template_operation('feedone');
    //printLabelData += choose_template(templateID);
    //printLabelData += start_trigger('filled');
    //var param = [{key:"product_name",value:"ProdName"},{key:"price",value:"10,00"},{key:"barcode",value:"027131691082"},{key:"tax_text",value:"IVA Inc."}/*,{key:"product_name",value:"2"}*/];
    /*select_and_insert('product_name','ProdName');
    select_and_insert('price','10,00');
    select_and_insert('barcode','027131691082');
    select_and_insert('tax_text','IVA Inc.');*/
    //printLabelData += print_start_command();
    //printLabelData += template_printLabelData();
    printLabelData += template_print();
    //printLabelData += template_operation('cut');
    var client = new net.Socket();
    client.connect(labelPrinterPort, labelPrinterHost, function() {
        console.log('CONNECTED TO: ' + labelPrinterHost + ':' + labelPrinterPort);
        console.log("printLabelData -> "+printLabelData);
        client.write(printLabelData);
        client.end();
    });
    client.on('data', function(data) {
        console.log('DATA: ' + data);
        // Close the client socket completely
        client.destroy();
    });
    client.on('close', function() {
        console.log('Connection closed');
    });
}


function template(){
    printLabelData = "";
    console.log("test template");
    var templateID=5;

    printLabelData += template_mode();
    printLabelData += template_init();
    //printLabelData += template_operation('feed2start');
    //printLabelData += template_operation('feed2start');
    //printLabelData += template_operation('feedone');
    //printLabelData += start_trigger('filled');
    printLabelData += choose_template(templateID);
    //printLabelData += start_trigger('filled');

    //select_and_insert("total","100€");
    //select_and_insert("extenso","cem euros");

    //printLabelData += template_data();
    printLabelData += template_print();
    //printLabelData += template_operation('cut');
    var client = new net.Socket();

    client.connect(labelPrinterPort, labelPrinterHost, function() {
        console.log('CONNECTED TO: ' + labelPrinterHost + ':' + labelPrinterPort);
        console.log("printLabelData -> "+printLabelData);
        client.write(printLabelData);
        client.end();
        //client.destroy();
    });

    client.on('data', function(data) {
        console.log('DATA: ' + data);
        // Close the client socket completely
        client.destroy();
    });

    client.on('close', function() {
        console.log('Connection closed');
    });
}
/********************************
 *
 *      Esc commands
 *
 ********************************/

function esc_command_mode(){
    //self.send(chr(27)+chr(105)+chr(97)+'0')
    return String.fromCharCode(27)+String.fromCharCode(105)+String.fromCharCode(97)+'0';
}
function esc_initialize(){
    //self.fonttype = self.font_types['bitmap']
    //self.send(chr(27)+chr(64))
    return String.fromCharCode(27)+String.fromCharCode(64);
}
function esc_bold(action){
    if(action == 'on'){
        action = 'E';
    }
    else{
        action = 'F';
    }

    return String.fromCharCode(27)+action;
}
function esc_send(text){
    printLabelData += text;
}
function esc_print(){//Sem efeito
    return String.fromCharCode(27)+'iC'+String.fromCharCode(0);
}
function esc_page_feed(){
    return String.fromCharCode(12);
}
function esc_final(){
    return String.fromCharCode(70) + String.fromCharCode(70);
}

function barcode(data, opts){
	console.log({barcode: "barcode"+data});
	if(opts==undefined) opts={};
	if(opts.format==undefined) opts.format='code128';
	if(opts.characters==undefined) opts.characters='on';
	if(opts.height==undefined) opts.height=48;
	if(opts.width==undefined) opts.width='xsmall';
	if(opts.parentheses==undefined) opts.parentheses='on';
	if(opts.ratio==undefined) opts.ratio='3:1';
	if(opts.equalize==undefined) opts.equalize='on';
	if(opts.rss_symbol==undefined) opts.rss_symbol='rss14std';
	if(opts.horiz_char_rss==undefined) opts.horiz_char_rss=2;

    var barcodes = {'code39': '0',
                'itf': '1',
                'ean8/upca': '5',
                'upce': '6',
                'codabar': '9',
                'code128': 'a',
                'gs1-128': 'b',
                'rss': 'c'};
    var widths = {'xsmall': '0',
              'small': '1',
              'medium': '2',
              'large': '3'};

    var ratios = {'3:1': '0',
              '2.5:1': '1',
              '2:1': '2'};

    var rss_symbols = {'rss14std': '0',
                   'rss14trun': '1',
                   'rss14stacked': '2',
                   'rss14stackedomni' : '3',
                   'rsslimited': '4',
                   'rssexpandedstd': '5',
                   'rssexpandedstacked': '6'
                   };

    var character_choices = {'off': '0',
                  'on' : '1'};
    var parentheses_choices = {'off':'1',
                           'on': '0'};
    var equalize_choices = {'off': '0',
                        'on': '1'};

    var sendstr = ''
    var n2 = opts.height/256
    var n1 = opts.height%256
        sendstr += (String.fromCharCode(27)+'i'+'t'+barcodes[opts.format]+'s'+'p'+'r'+character_choices[opts.characters]+'u'+'x'+'y'+'h' + String.fromCharCode(n1) + String.fromCharCode(n2) +
                    'w'+widths[opts.width]+'e'+parentheses_choices[opts.parentheses]+'o'+rss_symbols[opts.rss_symbol]+'c'+String.fromCharCode(opts.horiz_char_rss)+'z'+ratios[opts.ratio]+'f'+equalize_choices[opts.equalize]
                    + 'b' + data + String.fromCharCode(92))
        if (opts.format=='code128' || opts.format=='gs1-128')
            sendstr += String.fromCharCode(92)+ String.fromCharCode(92)
       return sendstr;
    }
function left_margin(margin){
     if (margin <= 255 && margin >= 0)
         return String.fromCharCode(27)+'I'+String.fromCharCode(margin);
}
function abs_horz_pos(amount){
    var n1 = amount%256
    var n2 = amount/256
    return String.fromCharCode(27)+'$'+String.fromCharCode(n1)+String.fromCharCode(n2);
}
function abs_vert_pos(amount){
    var mL = amount%256;
    var mH = amount/256;
    if (amount < 32767 && amount > 0) return String.fromCharCode(27)+'('+'V'+String.fromCharCode(2)+String.fromCharCode(0)+String.fromCharCode(mL)+String.fromCharCode(mH);
}
//length 1mm->12 dots
function page_length(length){
    var mH = length/256
    var mL = length%256
    if (length < 12000) return String.fromCharCode(27)+'('+'C'+String.fromCharCode(2)+String.fromCharCode(0)+String.fromCharCode(mL)+String.fromCharCode(mH);
}
/*function page_length(length){
    var mH = length/256;
    var mL = length%256;
    if (length < 12000)
        return String.fromCharCode(27)+'iX'+'('+String.fromCharCode(2)+String.fromCharCode(0)+String.fromCharCode(mL)+String.fromCharCode(mH);
}*/
function get_page_length(length){
    var mH = length/256;
    var mL = length%256;
    if (length < 12000)
        return String.fromCharCode(27)+'iX'+'('+String.fromCharCode(1)+String.fromCharCode(0)+String.fromCharCode(0);
}

function rotated_printing(action){
    return String.fromCharCode(27)+String.fromCharCode(105)+String.fromCharCode(76)+action;
}
function page_format(topmargin, bottommargin){
    var tL = topmargin%256;
    var tH = topmargin/256;
    var BL = bottommargin%256;
    var BH = topmargin/256;
    if ((tL+tH*256) < (BL + BH*256)) return String.fromCharCode(27)+'('+'c'+String.fromCharCode(4)+String.fromCharCode(0)+String.fromCharCode(tL)+String.fromCharCode(tH)+String.fromCharCode(BL)+String.fromCharCode(BH);
    else return '';
}
/*function printLabelProduct2(topicStr,msg){
    console.log('testEsc');

    printLabelData += esc_command_mode();
    printLabelData += page_length(168); //1mm->12dots
    printLabelData += esc_initialize();
//    printLabelData +=rotated_printing(0);
  //  printLabelData += page_format(35,36);
    printLabelData += page_length(168); //1mm->12dots
    //printLabelData += abs_horz_pos(24); //1mm->12dots
 //   printLabelData += abs_vert_pos(168); //1mm->12dots

//    printLabelData += barcode(169525);

 //   printLabelData += esc_bold('on');
   printLabelData += 'Finalmente!!!!!!!!!!!!!!!!!!';//esc_send('teste');
   printLabelData += template_operation("cut");
   printLabelData += page_length(168); //1mm->12dots
   //printLabelData += esc_print();
    //printLabelData += esc_page_feed();
    printLabelData += page_length(168); //1mm->12dots
    printLabelData += esc_final();
    printLabelData += page_length(168); //1mm->12dots

    var client = new net.Socket();
    client.connect(labelPrinterPort, labelPrinterHost, function() {
        console.log('CONNECTED TO: ' + labelPrinterHost + ':' + labelPrinterPort);
        // Write a message to the socket as soon as the client is connected, the server will receive it as message from the client
        //client.write('I am Chuck Norris!');
        console.log(JSON.stringify(printLabelData));
        client.write(printLabelData);
        //client.end();
        client.destroy();
       // client.write(status);
    });

    // Add a 'printLabelData' event handler for the client socket
    // data is what the server sent to this socket
    client.on('data', function(data) {

        console.log('DATA: ' + data);
        // Close the client socket completely
        client.destroy();

    });

    // Add a 'close' event handler for the client socket
    client.on('close', function() {
        console.log('Connection closed');
    });


}*/
/**********************************
 *
 *      End Printing Methods
 *
 *********************************/

function printLabel(text, font, fontSize){
	var printSequence = initstring() + processimage(renderImageFromText(text, font, fontSize)) + linefeed(5)
	tempFile = tempfile.NamedTemporaryFile()
	tempFile.write(printSequence)
	tempFile.file.flush()
	cupsConnection.printFile(printer, tempFile.name, text, {})
	tempFile.close()
}

/**********************************
 *
 *     Check MAC / IP's
 *
 *********************************/

 function deviceIp(mac,cb){
    console.log(("arpscanner"));

    arpscanner(function(err,data){
        if(err) throw err;
        if(data){
            if(mac){
                data.forEach(function(d){
                    if(d.mac.toLowerCase() == mac.toLowerCase()){
                        cb(d.ip);
                    }
                });
            }
            else{
                if(cb){
                    return cb(data);
                }
            }

        }
         console.log("data");
        console.log(data);
    });
}