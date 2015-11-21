var express	= require('express'),			// Express simplifies Node
	User 	= require('../models/user'),	// User Schema
	War 	= require('../models/war'),		// War Schema
	jwt 	= require('jsonwebtoken'),		// This is the package we will use for tokens
	config	= require('../../config');

module.exports = function(app, express) {
	var superSecret = config.secret;  // This is for the token

	// Get an instance of the express router
	var apiRouter = express.Router();

	// middleware to use for all requests
	apiRouter.use(function(req, res, next) {
		// do logging
		// we'll add more to the middleware in Chapter 10
		// this is where we will authenticate users
		next(); // make sure we go to the next routes and don't stop here
	});

	// route to authenticate a user (POST http://localhost:8080/api/authenticate)
	apiRouter.post('/authenticate', function(req, res) {
		// find the user
		// select the name username and password explicitly 
		User.findOne({
			name: req.body.name
		}).select('name username password').exec(function(err, user) {
			if (err) throw err;
			    // no user with that username was found

			if (!user) {
				res.json({
					success: false,
					message: 'Authentication failed. User not found.'
				});
			} else if (user) {
				// check if password matches
				var validPassword = user.comparePassword(req.body.password);
				if (!validPassword) {
			  		res.json({
			    		success: false,
			    		message: 'Authentication failed. Wrong password.'
					});
				} else {
					// if user is found and password is right
					// create a token
					var token = jwt.sign({
						name: user.name,
			        	id: user._id
			        }, superSecret, 
			        { expiresIn: 7200 // expires in 2 hours 
					});
					// Save this for later
					req.decoded = jwt.decode(token);
			        // return the information including token as JSON
					res.json({
						success: true,
						message: 'Enjoy your token!', token: token
					});
				}
			}
		});
	});

	// USERS //
	apiRouter.route('/users')
	// create a user (accessed at POST http://localhost:8080/api/users)
	.post(function(req, res) {
		// create a new instance of the User model
		var user = new User();
		// set the users information (comes from the request)
		user.name = req.body.name;
		user.id = req.body.id;
		user.password = req.body.password;
		user.admin = false;

		if (req.headers.referer.indexOf("/users") > -1) {
			user.approved = true;
			user.inClan = true;
		} else {
			user.approved = false;
			user.inClan = false;
		}

		// save the user and check for errors
		user.save(function(err) { 
			if (err) {
				// duplicate entry
				if (err.code == 11000)
					return res.json({ success: false, message: 'A user with that name already exists.' }); 
				else
					return res.send(err);
			}
			res.json({ 
				success: true,
				message: 'User created!' });
		})
	});

	// route middleware to verify a token
	apiRouter.use(function(req, res, next) {
		// check header or url parameters or post parameters for token
		var token = req.body.token || req.query.token || req.headers['x-access-token']; 

		// decode token
		if (token) {
			// verifies secret and checks exp
			jwt.verify(token, superSecret, function(err, decoded) { 
				if (err) {
					return res.status(403).send({ 
						success: false,
						message: 'Failed to authenticate token.'
					});
				} else {
					// if everything is good, save to request for use in other routes 
					req.decoded = decoded;
					next();
				}
			});
		} else {
			// If there is no token
			// Return an HTTP response of 403 (access forbidden) and an error message 
			return res.status(403).send({
				success: false,
				message: 'No token provided.'
			});
		}
		// next() used to be here
	});

	apiRouter.route('/users')
	// get all the users (accessed at GET http://localhost:8080/api/users)
	.get(function(req, res) {
		User.find(function(err, users) {
			if (err) res.send(err);
			// return the users
			res.json(users);
		});
	});

	// API endpoint to get user information
	apiRouter.get('/me', function(req, res) {
		res.send(req.decoded);
	});

	// route middleware to verify the token is owned by an admin
	apiRouter.use(function(req, res, next) {
		// use our user model to find the user we want
		User.findById(req.decoded.id, function(err, user) { 

			if (user.admin == true) {
				next();
			} else {
				return res.status(403).send({
					success: false,
					message: 'Failed to authenticate token.'
				});
			}
		});
	});

	// SPECIFIC USERS //
	apiRouter.route('/users/:user_id')
	// (accessed at GET http://localhost:8080/api/users/:user_id) 
	.get(function(req, res) {
		User.findById(req.params.user_id, function(err, user) { 
			if (err) res.send(err);
			// return that user
			res.json(user);
		});
	})

	// update the user with this id
	// (accessed at PUT http://localhost:8080/api/users/:user_id) 
	.put(function(req, res) {
		// use our user model to find the user we want
		User.findById(req.params.user_id, function(err, user) { 
			if (err) res.send(err);
			// update the users info only if its new
			if (req.body.name) 
				user.name = req.body.name;
			if (req.body.username) 
				user.id = req.body.id;
			if (req.body.password)
				user.password = req.body.password;
			if (req.body.approved != null)
				user.approved = req.body.approved;
			if (req.body.inClan != null)
				user.inClan = req.body.inClan;
			if (req.body.admin != null)
				user.admin = req.body.admin;
			// save the user
			user.save(function(err) {
				if (err) res.send(err);
				// return a message
				res.json({ message: 'User updated!' });
			});
		});
	})

	// Delete the user with this id
	// (accessed at DELETE http://localhost:8080/api/users/:user_id)
	.delete(function(req, res) {
		User.remove({
			_id: req.params.user_id
		}, function(err, user) {
			if (err) return res.send(err);
			res.json({ message: 'Successfully deleted' });
		});
	});

	apiRouter.route('/wars')
	// create a war (accessed at POST http://localhost:8080/api/wars)
	.post(function(req, res) {
		// create a new instance of the User model
		var war = new War();
		// set the users information (comes from the request)
		war.number = req.body.number;
		war.exp = req.body.exp;
		war.ourScore = req.body.ourScore;
		war.theirScore = req.body.theirScore;
		war.date = req.body.date;

		// save the war and check for errors
		war.save(function(err) { 
			if (err) {
				// duplicate entry
				if (err.code == 11000)
					return res.json({ success: false, message: 'A war with that number already exists.' }); 
				else
					return res.send(err);
			}
			res.json({ 
				success: true,
				message: 'War created!' });
		})
	})
	// get all the wars (accessed at GET http://localhost:8080/api/wars)
	.get(function(req, res) {
		War.find(function(err, wars) {
			if (err) res.send(err);
			// return the wars
			res.json(wars);
		});
	})

	// SPECIFIC WARS //
	apiRouter.route('/wars/:war_id')
	// (accessed at GET http://localhost:8080/api/wars/:war_id) 
	.get(function(req, res) {
		War.findById(req.params.war_id, function(err, war) { 
			if (err) res.send(err);
			// return that user

			res.json(war);
		});
	})

	// update the user with this id
	// (accessed at PUT http://localhost:8080/api/users/:user_id) 
	.put(function(req, res) {
		// use our war model to find the war we want
		War.findById(req.params.war_id, function(err, war) { 
			if (err) res.send(err);
			// update the wars info only if its new
			if (req.body.number) 
				war.number = req.body.number;
			if (req.body.exp) 
				war.exp = req.body.exp;
			if (req.body.ourScore)
				war.ourScore = req.body.ourScore;
			if (req.body.theirScore)
				war.theirScore = req.body.theirScore;
			if (req.body.date)
				war.date = req.body.date;
			// save the war
			war.save(function(err) {
				if (err) res.send(err);
				// return a message
				res.json({ message: 'War updated!' });
			});
		});
	});


	return apiRouter;

};



