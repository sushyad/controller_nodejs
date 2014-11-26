// BASE SETUP
// =============================================================================

// call the packages we need
var express    = require('express'); 		// call express
var app        = express(); 				// define our app using express
var bodyParser = require('body-parser');
var mqtt = require('mqtt');
var options = {reconnectPeriod: 5000};

var mqttClient = mqtt.createClient(1883, '192.168.0.9', options);

// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var port = process.env.PORT || 8080; 		// set our port

var dryerStateChangeTime, isDryerOn = false;

// ROUTES FOR OUR API
// =============================================================================
var router = express.Router(); 				// get an instance of the express Router

var serialport = require("serialport");
var serial = new serialport.SerialPort("/dev/ttyUSB0", { baudrate : 9600, parser: serialport.parsers.readline("\n") });

mqttClient.on('connect', function() {
  mqttClient.subscribe('wsn/+/command');
  console.log('Connected');
});

mqttClient.on('message', function(topic, message) {
  //sample message: Switch21_BTN0:ON

  var topicTokens = topic.split('/');
  var item = topicTokens[1];
  console.log(item + ':' + message);
  var indexOfBtn = item.indexOf('_BTN');
  var indexOfSwitch = item.indexOf('Switch');
  if (indexOfSwitch == 0) {
   if (indexOfBtn > 0) {
      var switchId = item.substring(6, indexOfBtn);
      var buttonId = item.substring(indexOfBtn + 4);
      var buttonState = '0';
      if (message == 'ON') buttonState = '1';
      console.log('Received command for light switch ' + switchId + '-' + buttonId + ':' +  message);
      serial.write('LSWITCH' + switchId + ':' + buttonId + ':' + buttonState + '\r');
    } else {
      var switchId = item.substring(6).toUpperCase();
      console.log('Received command for switch ' + switchId + ': ' + message);
      if (switchId == 'PROJECTOR') {
        serial.write(switchId + message + '\r');
      } else {
        serial.write('SWITCH' + switchId + message + '\r');
      }
    }
  } else if (item == 'DRYER') {
    if (message == 'getStatus') {
      serial.write('DRYER:' + message + '\r');
    }
  }
});

/*
  mqttClient.on('pingreq', function(packet) {
    console.log('Received pingreq');
    mqttClient.pingresp();
  });

  mqttClient.on('disconnect', function(packet) {
    console.log('Received disconnect');
    mqttClient.stream.end();
  });

  mqttClient.on('close', function(err) {
    console.log('Received error: ' + err);
  });

  mqttClient.on('error', function(err) {
    console.log('error!', err);
    mqttClient.disconnect();
  });
*/

serial.on("data", function (data) {
  var status = '';
  if (data.indexOf(' OPEN ') != -1)  status = 'Open';
  if (data.indexOf(' CLOSED ') != -1) status = 'Closed';
  if (data.indexOf(' OPENING ') != -1) status = 'Opening';
  if (data.indexOf(' CLOSING ') != -1) status = 'Closing';
  if (data.indexOf(' UNKNOWN ') != -1) status = 'Unknown';

  if (data.length > 0) {
    data = data.trim();

    console.log('Data: ' + data);

    var switchId = data.substring(data.indexOf('[') + 1, data.indexOf(']'));

    if (switchId == '41') {
      if (data.indexOf('D1') > 0) {

        if (!isDryerOn) {
          console.log("Dryer turned ON");
          isDryerOn = true;
          dryerStateChangeTime = new Date();
          mqttClient.publish('wsn/dryer/state', 'ON', function() {
            //console.log("Message has been published");
          });           
        }
      } else if (data.indexOf('D0') > 0) {
        if (isDryerOn) {
          console.log('Dryer just turned off!');
          mqttClient.publish('wsn/dryer/state', 'OFF', function() {
            console.log("Message has been published");
          });
          isDryerOn = false;
        }
        
        console.log("Dryer is OFF");
      } else if (data.indexOf('W1' > 0)) {
        console.log("Washer is ON");
      } else if (data.indexOf('W0' > 0)) {
        console.log("Washer is OFF");
      }
    } else {
    var indexOfPulseCount = data.indexOf('Pulsecount');
    var indexOfBtn = data.indexOf('BTN');
    if (indexOfPulseCount > -1) {
      var indexOfPower =  data.indexOf('Power');
      var pulseCount = data.substring(indexOfPulseCount + 12, indexOfPower - 1);
      var power = data.substring(indexOfPower + 7);

      //console.log('Will publish pulse count: "' + pulseCount + '"');
      //console.log('Will publish power: "' + power + '"');

      mqttClient.publish('wsn/electric_meter/pulseCount', pulseCount, function() {
        //console.log("Message has been published");
      });

      mqttClient.publish('wsn/electric_meter/power', power, function() {
        //console.log("Message has been published");
      });
    } else if (indexOfBtn > 0 && data.indexOf('Command') < 0) {
      data = data.trim();
      var indexOfColon = data.indexOf(':');
      var buttonId = data.substring(indexOfBtn + 3, indexOfColon);
      var buttonState = data.substring(indexOfColon + 1);
      console.log('Will publish to topic ' + 'wsn/Switch' + switchId + '_BTN' + buttonId + '/state', buttonState == '0' ? 'OFF' : 'ON');
      mqttClient.publish('wsn/Switch' + switchId + '_BTN' + buttonId + '/state', buttonState == '0' ? 'OFF' : 'ON', function() {
        //console.log("Message has been published");
      });
    }
    }
  }
});

router.put('/switches/:switchID?', function(req, res) {
	console.log('Received command for switch ' + req.params.switchID + ': ' + req.body.state);
	serial.write('SWITCH' + req.params.switchID + req.body.state + '\r');
	res.json({ message: 'sent the command to switch ' + req.params.switchID });
});

router.put('/lightSwitches/:switchID?/buttons/:buttonID?', function(req, res) {
	console.log('Received command for light switch ' + req.params.switchID + ': ' + req.body.state);
	serial.write('LSWITCH' + req.params.switchID + ':' + req.params.buttonID + ':' + req.body.state + '\r');
	res.json({ message: 'sent the command to switch ' + req.params.switchID });
});

router.put('/projector', function(req, res) {
	console.log('Received command for projector: ' + req.body.state);
	serial.write('PROJECTOR' + req.body.state + '\r');
	res.json({ message: 'sent the command to projector'});
});

router.get('/dryer/state', function(req, res) {
	console.log('Received status request for dryer');
	res.writeHead(200, {'Content-Type': 'text/plain'});
	res.end(isDryerOn ? 'ON' : 'OFF');
});

// more routes for our API will happen here

// REGISTER OUR ROUTES -------------------------------
// all of our routes will be prefixed with /api
app.use('/api', router);

// START THE SERVER
// =============================================================================
app.listen(port);
console.log('Magic happens on port ' + port);

