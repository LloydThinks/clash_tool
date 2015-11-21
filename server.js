// --------------------------- CALL THE PACKAGES --------------------------- //

var express		= require('express'),			// Express simplifies Node
	app			= express(),					// To hook up "app" to Express
	mongoose 	= require('mongoose'),			// Mongoose is our interface to MongoDB
	bodyParser 	= require('body-parser'),		// Allows us to parse posts
	morgan		= require('morgan'),			// Outputs all api calls to the terminal
	bcrypt 		= require('bcrypt-nodejs'),		// Encryption for user passwords
	path 		= require('path'),
	config		= require('./config');
	options 	= { server: { socketOptions: { keepAlive: 1, connectTimeoutMS: 10000 } },
					replset: { socketOptions: { keepAlive: 1, connectTimeoutMS : 10000 } } };


// --------------------------- APP CONFIGURATION ---------------------------- //

// Use body parser so we can grab information from POST requests
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Configure our app to handle CORS requests
app.use(function(req, res, next) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
	res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type, Authorization');
	next();
});

// Log all requests to the console
app.use(morgan('dev'));

// Set the Mongolab URL for database interactions
mongoose.connect(config.database, options);

// set static files location
// set the public folder to serve public assets such as HTML, CSS, and JS files
app.use(express.static(__dirname + '/public'));


// -------------------------- ROUTE CONFIGURATION --------------------------- //

// API ROUTES ------------------------
var apiRoutes = require('./app/routes/api')(app, express); 
app.use('/api', apiRoutes);

// MAIN CATCHALL ROUTE ---------------
// SEND USERS TO FRONTEND ------------
// Basic route for the home page
// set up our one route to the index.html file
app.get('*', function(req, res) {
	res.sendFile(path.join(__dirname + '/public/app/views/index.html'));
});


// --------------------------- START THE SERVER ---------------------------- //

app.listen(config.port);
console.log('Node server listening on ' + config.port);


