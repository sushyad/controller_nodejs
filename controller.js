// BASE SETUP
// =============================================================================

// call the packages we need
var express    = require('express'); 		// call express
var app        = express(); 				// define our app using express
var bodyParser = require('body-parser');
var mqtt = require('mqtt');

var mqttClient = mqtt.createClient(1883, '192.168.0.109');

// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var port = process.env.PORT || 8080; 		// set our port

// ROUTES FOR OUR API
// =============================================================================
var router = express.Router(); 				// get an instance of the express Router

var serialport = require("serialport");
var serial = new serialport.SerialPort("/dev/ttyUSB1", { baudrate : 115200, parser: serialport.parsers.readline("\n") });

serial.on("data", function (data) {
  var status = '';
  if (data.indexOf(' OPEN ') != -1)  status = 'Open';
  if (data.indexOf(' CLOSED ') != -1) status = 'Closed';
  if (data.indexOf(' OPENING ') != -1) status = 'Opening';
  if (data.indexOf(' CLOSING ') != -1) status = 'Closing';
  if (data.indexOf(' UNKNOWN ') != -1) status = 'Unknown';

  if (data.length > 0) {
    if (data.indexOf('Pulsecount') > -1) {
      //console.log('Will publish pulse count data: ' + data);
      mqttClient.publish('wsn/electric_meter', data, function() {
        //console.log("Message has been published");
      });
    }
  }
});

router.put('/switches/:switchID?', function(req, res) {
	console.log('Received command for switch ' + req.params.switchID + ': ' + req.body.state);
	serial.write('SWITCH' + req.params.switchID + req.body.state + '\r');
	res.json({ message: 'sent the command to switch ' + req.params.switchID });
});

router.put('/projector', function(req, res) {
	console.log('Received command for projector: ' + req.body.state);
	serial.write('PROJECTOR' + req.body.state + '\r');
	res.json({ message: 'sent the command to projector'});
});

// more routes for our API will happen here

// REGISTER OUR ROUTES -------------------------------
// all of our routes will be prefixed with /api
app.use('/api', router);

// START THE SERVER
// =============================================================================
app.listen(port);
console.log('Magic happens on port ' + port);

