var express	= require('express'),			// Express simplifies Node
	User 	= require('../models/user'),	// User Schema
	War 	= require('../models/war'),		// War Schema
	jwt 	= require('jsonwebtoken'),		// This is the package we will use for tokens
	aws 	= require('aws-sdk'),			// This is for uploading to S3
	bcrypt	= require('bcrypt-nodejs');

// Need to try/catch the config setup
var config = {}; // This is to prevent errors later
try {
	config = require('../../config');
} catch (e) {
	console.log("Running on Heroku, use Config Vars");
}

// Grab some config variables stored locally in the config or in the env if running on Heroku
var AWS_ACCESS_KEY 	= config.AWS_ACCESS_KEY_ID 		|| process.env.AWS_ACCESS_KEY_ID,
	AWS_SECRET_KEY 	= config.AWS_SECRET_ACCESS_KEY 	|| process.env.AWS_SECRET_ACCESS_KEY,
	S3_BUCKET_NAME 	= config.S3_BUCKET_NAME			|| process.env.S3_BUCKET_NAME,
	TOKEN_SECRET 	= config.TOKEN_SECRET 			|| process.env.TOKEN_SECRET,
	PORT			= config.PORT					|| process.env.PORT;

var AWS = require("aws-sdk");

// Need to try/catch the config setup
var config = {}; // This is to prevent errors later
try {
	config = require('../../config');
} catch (e) {
	console.log("Running on Heroku, use Config Vars");
}

AWS.config.update({
	"accessKeyId": AWS_ACCESS_KEY,
	"secretAccessKey": AWS_SECRET_KEY,
	"region": "us-west-2"
});

var dynamodb = new AWS.DynamoDB();

var dynamodbDoc = new AWS.DynamoDB.DocumentClient();

module.exports = function(app, express) {

	// Get an instance of the express router
	var apiRouter = express.Router();

	// ============================ PUBLIC APIS ============================ //

	// route to authenticate a user (POST http://localhost:8080/api/authenticate)
	apiRouter.post('/authenticate', function(req, res) {
		// find the user
		// select the name username and password explicitly 

		dynamodb.query({
			TableName : "Users",
			ProjectionExpression: "#n, password, id, inClan, admin",
			KeyConditionExpression: "#n = :nameVal",
			ExpressionAttributeNames: {
				"#n": "name"
			},
			ExpressionAttributeValues: {
				":nameVal": {'S': req.body.name}
			},
			Limit : 1000
		}, function(err, data) {
			if (err) { 
				return res.json({
					success: false,
					message: 'Database Error. Try again later.',
					data: data
				});
			}

			if (data.Count == 0) {  // Then the username must have been incorrect
				return res.json({
					success: false,
					message: 'Authentication failed. User not found.'
				});
			} else {

				// check if password matches
				var validPassword = bcrypt.compareSync(req.body.password, data.Items[0].password.S);

				if (!validPassword) {
					res.json({
						success: false,
						message: 'Authentication failed. Wrong password.'
					});
				} else {

					// if user is found and password is right
					// create a token
					var token = jwt.sign({
						name: data.Items[0].name.S,
						inClan: data.Items[0].inClan.BOOL,
						admin: data.Items[0].admin.BOOL
					}, TOKEN_SECRET,
					{ expiresIn: 7200 // expires in 2 hours 
					// { expiresIn: 10 // expires in 10 seconds (This is for debugging)
					});
					// Save this for later
					req.decoded = jwt.decode(token);
					// return the information including token as JSON
					res.json({
						success: true,
						message: 'Enjoy your token!', 
						token: token
					});
				}
			}
		});
	});

	// USERS //
	apiRouter.route('/users')
	// create a user (accessed at POST http://localhost:8080/api/users)
	.post(function(req, res) {

		userModel = new User();

		var user = {
			TableName: 'Users',
			Item: {},
			Expected: {
				"name" : { "Exists" : false},
			}
		};

		// set the users information (comes from the request)
		user.Item.name = req.body.name;
		user.Item.id = req.body.id;
		now = new Date();
		user.Item.dateJoined = now.getTime();

		user.Item.password = bcrypt.hashSync(req.body.password);
		
		user.Item.admin = false;  // Default to false
		if (req.body.admin)
			user.Item.admin = req.body.admin;

		user.Item.title = "Member";  // Default to "Member"
		if (req.body.title)
			user.Item.title = req.body.title;

		if (req.headers.referer.indexOf("/users") > -1)
			user.Item.inClan = true;
		else
			user.Item.inClan = false;

		dynamodbDoc.put(user, function(err, data) {
			if (err) {
				console.error("Unable to add user. Error JSON:", JSON.stringify(err, null, 2));
				return res.json({ 
					success: false, 
					message: err.message
				}); 
			} else {
				res.json({ 
					success: true,
					message: 'User created!' 
				});
			}
		});
	});

	apiRouter.route('/partialUsers')
	// get all the users (accessed at GET http://localhost:8080/api/users)
	.get(function(req, res) {

		dynamodb.scan({
			TableName : "Users",
			ProjectionExpression: "#n, title, dateJoined, inClan",
			FilterExpression: "inClan = :jut",
			ExpressionAttributeNames: {
				"#n": "name"
			},
			ExpressionAttributeValues: {
				":jut": {'BOOL': true},
			},
			Limit : 1000
		}, function(err, data) {
			if (err) { 
				return res.json({
					success: false,
					message: 'Database Error. Try again later.',
					data: data.Items
				});
			}
			res.json({
				success: true,
				message: 'Successfully returned all Users',
				data: data.Items
			});
		});
	});

	apiRouter.route('/partialWars')
	// get all the users (accessed at GET http://localhost:8080/api/users)
	.get(function(req, res) {

		dynamodb.scan({
			TableName : "Wars",
			ProjectionExpression: "createdAt, #1, outcome, ourScore, theirScore, exp",
			ExpressionAttributeNames: {
				"#1": "start"
			},
			Limit : 1000
		}, function(err, data) {
			if (err) { 
				return res.json({
					success: false,
					message: 'Database Error. Try again later',
				});
			}
			res.json({
				success: true,
				message: 'Successfully returned all Wars',
				data: data.Items
			});
		});
	});

	// ======================== BASIC AUTHENTICATION ======================== //

	// route middleware to verify a token
	apiRouter.use(function(req, res, next) {
		// check header or url parameters or post parameters for token
		var token = req.body.token || req.query.token || req.headers['x-access-token']; 

		// decode token
		if (token) {
			// verifies secret and checks exp
			jwt.verify(token, TOKEN_SECRET, function(err, decoded) { 
				if (err) {
					return res.status(403).send({
						error: err,
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
				error: { name: 'NoTokenProvidedError' },
				success: false,
				message: 'No token provided.'
			});
		}
		// next() used to be here
	});

	// ============================ PRIVATE APIS ============================ //

	// API endpoint to get user information
	apiRouter.get('/me', function(req, res) {
		res.send(req.decoded);
	});

	apiRouter.route('/wars')
	// get all the wars (accessed at GET http://localhost:8080/api/wars)
	.get(function(req, res) {
		dynamodb.scan({
			TableName : "Wars",
			Limit : 1000
		}, function(err, data) {
			if (err) { 
				return res.json({
					success: false,
					message: 'Database Error. Try again later.'
				});
			}
			res.json({
				success: true,
				message: 'Successfully returned all Wars',
				data: data.Items
			});
		});
	});

	// apiRouter.route('/lastWar')
	// // get the last war (accessed at GET http://localhost:8080/api/lastWar)
	// .get(function(req, res) {

	// 	dynamodb.query({
	// 		TableName : 'Wars',
	// 		KeyConditionExpression: '#1 ',
	// 		ExpressionAttributeNames: {
	// 			'#1': 'start'
	// 		},
	// 		ExpressionAttributeValues: {
	// 			':nameVal': ''
	// 		},
	// 		Limit : 1000
	// 	}, function(err, data) {
	// 		if (err) { 
	// 			console.log(err); return; 
	// 		}
	// 		res.json({
	// 			success: true,
	// 			message: 'Successfully returned all Wars',
	// 			data: data.Items
	// 		});
	// 	});

	// 	// console.log("LAST WAR");
	// 	// War.findOne({}, {}, { sort: { 'start' : -1 } }, function(err, wars) {
	// 	// 	if (err) res.send(err);
	// 	// 	// return the wars
	// 	// 	res.json(wars);
	// 	// });
	// });

	// ======================== ADMIN AUTHENTICATION ======================== //

	// route middleware to verify the token is owned by an admin
	apiRouter.use(function(req, res, next) {

		if (req.decoded.admin) {
			next();
		} else {
			return res.status(403).send({
				error: err,
				success: false,
				message: 'Failed to authenticate token.'
			});
		}
	});

	// ============================= ADMIN APIS ============================= //

	apiRouter.route('/users')
	// get all the users (accessed at GET http://localhost:8080/api/users)
	.get(function(req, res) {

		dynamodb.scan({
			TableName : "Users",
			ProjectionExpression: "#n, admin, dateJoined, id, inClan, title",
			ExpressionAttributeNames: {
				"#n": "name"
			},
			Limit : 1000
		}, function(err, data) {
			if (err) { 
				return res.json({
					success: false,
				    message: 'Database Error. Try again later'
				});
			}
			res.json({
				success: true,
			    message: 'Successfully returned all Users',
				data: data.Items
			});
		});
	});

	// AMAZON S3 ROUTE // 
	apiRouter.route('/sign_s3')
	// (accessed at GET http://localhost:8080/api/sign_s3) 
	.get(function(req, res){
		aws.config.update({accessKeyId: AWS_ACCESS_KEY, secretAccessKey: AWS_SECRET_KEY});
		var s3 = new aws.S3();
		var s3_params = {
			Bucket: S3_BUCKET_NAME,
			Key: req.query.file_name,
			Expires: 60,
			ContentType: req.query.file_type,
			ACL: 'public-read'
		};
		s3.getSignedUrl('putObject', s3_params, function(err, data){
			if(err){
				console.log(err); return;
			} else{
				var date = new Date()
				var return_data = {
					signed_request: data,
					url: 'https://'+S3_BUCKET_NAME+'.s3.amazonaws.com/'+req.query.file_name
				};
				res.write(JSON.stringify(return_data));
				res.end();
			}
		});
	});

	// SPECIFIC USERS //
	apiRouter.route('/users/:user_id')
	// (accessed at GET http://localhost:8080/api/users/:user_id) 
	.get(function(req, res) {
	
		dynamodb.query({
			TableName : 'Users',
			ProjectionExpression: "#1, id, inClan, admin, dateJoined, title",
			KeyConditionExpression: '#1 = :val',
			ExpressionAttributeNames: {
				'#1': 'name'
			},
			ExpressionAttributeValues: {
				':val': { 'S': req.params.user_id }
			},
			Limit : 1000
		}, function(err, data) {

			if (err) { 
				console.log(err.message);
				return res.json({
					success: false,
					message: 'Database Error. Try again later.',
					data: err
				});
			}

			if (data.Count == 0) {  // Then the username must have been incorrect
				return res.json({
					success: false,
					message: 'Query Failed. User not found.'
				});
			} else {
				// Convert Data before sending it back to client
				data = data.Items[0];
				data.name = data.name.S;
				data.id = data.id.S;
				data.inClan = data.inClan.BOOL;
				data.admin = data.admin.BOOL;
				data.dateJoined = data.dateJoined.N;
				data.title = data.title.S;

				res.json({
					success: true,
					message: 'Successfully returned user',
					data: data
				});
			}
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
			if (req.body.title)
				user.title = req.body.title;
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
				res.json({
					success: true,
					message: 'User updated!'
				});
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

		var war = {
			TableName: 'Wars',
			Item: {},
			Expected: {
				"start" : { "Exists" : false },
			}
		};

		// set the war information (comes from the request)
		// Required information //
		now = new Date();
		war.Item.createdAt = now.getTime().toString();
		war.Item.opponent = req.body.opponent;
		war.Item.start = req.body.start;
		war.Item.size = req.body.size;
		war.Item.warriors = req.body.warriors;

		// Optional Information if War is Over//
		if (!req.body.inProgress) {
			war.Item.exp = req.body.exp;
			war.Item.ourScore = req.body.ourScore;
			war.Item.theirScore = req.body.theirScore;
			war.Item.ourDest = req.body.ourDest;
			war.Item.theirDest = req.body.theirDest;
			war.Item.outcome = req.body.outcome;
		}

		dynamodbDoc.put(war, function(err, data) {
			if (err) {
				console.error("Unable to add War. Error JSON:", JSON.stringify(err, null, 2));
				return res.json({ 
					success: false, 
					message: err.message
				}); 
			} else {
				res.json({ 
					success: true,
					message: 'War created!' 
				});
			}
		});
	});


	// SPECIFIC WARS //
	apiRouter.route('/wars/:war_id')
	// (accessed at GET http://localhost:8080/api/wars/:war_id) 
	.get(function(req, res) {
		dynamodb.query({
			TableName : 'Wars',
			KeyConditionExpression: '#1 = :createdAt',
			ExpressionAttributeNames: {
				'#1': 'createdAt'
			},
			ExpressionAttributeValues: {
				':createdAt': { 'S': req.params.war_id }
			},
			Limit : 1000
		}, function(err, data) {
			if (err) { 
				console.log(err.message);
				return res.json({
					success: false,
					message: 'Database Error. Try again later.',
					data: err
				});
			}

			if (data.Count == 0) {  // Then the username must have been incorrect
				return res.json({
					success: false,
					message: 'Query Failed. War not found.'
				});
			} else {

				// Get the only item we want out of the array
				data = data.Items[0];

				// Convert all the values to non-object values
				data.createdAt = Number(data.createdAt.S);
				data.start = Number(data.start.N);
				data.size = Number(data.size.N);
				data.opponent = data.opponent.S;
				if (data.outcome) {
					data.exp = Number(data.exp.N);
					data.ourScore = data.ourScore.N;
					data.theirScore = data.theirScore.N;
					data.ourDest = Number(data.ourDest.N);
					data.theirDest = Number(data.theirDest.N);
					data.outcome = data.outcome.S;
				}

				// Correct warrior data array
				data.warriors = data.warriors.L
				for (var i = 0; i < data.warriors.length; i++) {
					// Strip L
					data.warriors[i] = data.warriors[i].M;

					// Convert all the values to non-object values
					data.warriors[i].attack1 = data.warriors[i].attack1.S;
					data.warriors[i].attack2 = data.warriors[i].attack2.S;
					data.warriors[i].stars1 = data.warriors[i].stars1.S;
					data.warriors[i].stars2 = data.warriors[i].stars2.S;
					data.warriors[i].name = data.warriors[i].name.S;
					data.warriors[i].viewed = data.warriors[i].viewed.BOOL;
					data.warriors[i].lock1 = data.warriors[i].lock1.BOOL;
					data.warriors[i].lock2 = data.warriors[i].lock2.BOOL;

				};

				res.json({
					success: true,
					message: 'Successfully returned all Wars',
					data: data
				});
			}
		});
	})

	// update the war with this id
	// (accessed at PUT http://localhost:8080/api/wars/:war_id) 
	.put(function(req, res) {

		// update the wars info only if its new

		// war.exp = req.body.exp;
		// war.ourScore = req.body.ourScore;
		// war.theirScore = req.body.theirScore;
		// war.ourDest = req.body.ourDest;
		// war.TheirDest = req.body.TheirDest;

		// if (req.body.outcome)
		// 	war.outcome = req.body.outcome;
		// if (req.body.img)
		// 	war.img = req.body.img;

		// console.log(req.body);

		if (req.body.inProgress) {  // Then we only want to set a limit number of values
			updateExpression = 'set #s = :val1, opponent = :val2, size = :val3, warriors = :val4';
			expressionAttributeValues = {
				':val1' : req.body.start,
				':val2' : req.body.opponent,
				':val3' : req.body.size,
				':val4' : req.body.warriors
			}
		} else {
			updateExpression = 'set #s = :val1, opponent = :val2, size = :val3, warriors = :val4,\
								exp = :val5, ourScore = :val6, theirScore = :val7,\
								ourDest = :val8, theirDest = :val9';
			expressionAttributeValues = {
				':val1' : req.body.start,
				':val2' : req.body.opponent,
				':val3' : req.body.size,
				':val4' : req.body.warriors,
				':val5' : req.body.exp,
				':val6' : req.body.ourScore,
				':val7' : req.body.theirScore,
				':val8' : req.body.ourDest,
				':val9' : req.body.theirDest
			}				
		}

		dynamodbDoc.update({
			TableName: 'Wars',
			Key:{
				'createdAt': req.body.createdAt.toString()
			},
			UpdateExpression: updateExpression,
			ExpressionAttributeNames: {
				'#s': 'start'
			},
			ExpressionAttributeValues: expressionAttributeValues
		}, function(err, data) {
			if (err) {
				console.log(err);
				return res.json({
					success: false,
					message: err.message
				});
			} else {
				res.json({
					success: true,
					message: 'Successfully Updated War'
				});
			}
		});

		// // use our war model to find the war we want
		// War.findById(req.params.war_id, function(err, war) { 
		// 	if (err) res.send(err);
		// 	// update the wars info only if its new

		// 	war.opponent = req.body.opponent;
		// 	war.exp = req.body.exp;
		// 	war.ourScore = req.body.ourScore;
		// 	war.theirScore = req.body.theirScore;
		// 	war.ourDest = req.body.ourDest;
		// 	war.TheirDest = req.body.TheirDest;
		// 	war.start = req.body.start;
		// 	war.size = req.body.size;
		// 	war.warriors = req.body.warriors;

		// 	if (req.body.outcome)
		// 		war.outcome = req.body.outcome;
		// 	if (req.body.img)
		// 		war.img = req.body.img;

		// 	// save the war
		// 	war.save(function(err) {
		// 		if (err) res.send(err);
		// 		// return a message
		// 		res.json({ message: 'War updated!' });
		// 	});
		// });
	});

	return apiRouter;

};




