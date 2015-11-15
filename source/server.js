// --------------------------- CALL THE PACKAGES --------------------------- //

var express		= require('express'),			// Express simplifies Node
	app			= express(),					// To hook up "app" to Express
	mongoose 	= require('mongoose'),			// Mongoose is our interface to MongoDB
	bodyParser 	= require('body-parser'),		// Allows us to parse posts
	morgan		= require('morgan'),			// Outputs all api calls to the terminal
	bcrypt 		= require('bcrypt-nodejs'),		// Encryption for user passwords
	path 		= require('path'),
	apiRouter 	= require('./api-routes'),		// This is the router code we wrote
	options 	= { server: { socketOptions: { keepAlive: 1, connectTimeoutMS: 10000 } },
					replset: { socketOptions: { keepAlive: 1, connectTimeoutMS : 10000 } } };

// --------------------------- APP CONFIGURATION ---------------------------- //

// Set the Mongolab URL for database interactions
mongoose.connect('mongodb://admin:admin@ds053954.mongolab.com:53954/clash_tool', options);

// Use body parser so we can grab information from POST requests
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// only requests to /api/* will be sent to our "router"
app.use('/api', apiRouter);

// Configure our app to handle CORS requests
app.use(function(req, res, next) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
	res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type, Authorization');
	next();
});

// Log all requests to the console
app.use(morgan('dev'));


// -------------------------- ROUTE CONFIGURATION --------------------------- //


// Basic route for the home page
app.get('/', function(req, res) {
	res.send('Welcome to the home page!');
	// res.sendFile(path.join(__dirname + '/client/index.html'));
});

// ------------------------------ BASE SETUP ------------------------------- //


// --------------------------- START THE SERVER ---------------------------- //

app.listen(8080);
console.log('Node server listening on 1337!');



