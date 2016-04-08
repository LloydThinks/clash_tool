var express	= require('express'),			// Express simplifies Node
	jwt 	= require('jsonwebtoken'),		// This is the package we will use for tokens
	aws 	= require('aws-sdk'),			// This is for uploading to S3
	bcrypt	= require('bcrypt-nodejs'),
	http 	= require('http'),
	Promise = require('bluebird');

// Used "db" as a namespace mimic for this library I wrote
require('./aws-crud.js')();


// Need to try/catch the config setup
var config = {}; // This is to prevent errors later
try {
	config = require('../../config.js');
} catch (e) {
	// console.log("Running on Heroku, use Config Vars");
}

// Grab some config variables stored locally in the config or in the env if running on Heroku
var AWS_ACCESS_KEY 	= config.AWS_ACCESS_KEY_ID 		|| process.env.AWS_ACCESS_KEY_ID,
	AWS_SECRET_KEY 	= config.AWS_SECRET_ACCESS_KEY 	|| process.env.AWS_SECRET_ACCESS_KEY,
	S3_BUCKET_NAME 	= config.S3_BUCKET_NAME			|| process.env.S3_BUCKET_NAME,
	TOKEN_SECRET 	= config.TOKEN_SECRET 			|| process.env.TOKEN_SECRET;

var AWS = require("aws-sdk");

AWS.config.update({
	"accessKeyId": AWS_ACCESS_KEY,
	"secretAccessKey": AWS_SECRET_KEY,
	"region": "us-west-2"
});

var dynamodb = new AWS.DynamoDB();

var dynamodbDoc = new AWS.DynamoDB.DocumentClient();

/* ============================ HELPER FUNCTIONS ============================ */

var convertData = function(data) {
	if (Array.isArray(data)) {
		for (i in data)
			data[i] = convertData(data[i]);
	} else {  // An object
		for (item in data) {
			type = Object.keys(data[item])[0];
			if (type == 'M')
				data[item] = convertData(data[item][type]);
			else
				data[item] = data[item][type];
		}
	}
	return data;
};

var createToken = function (data) {
	if (!data.username || !data.gamename || !data.clan || !data.hasOwnProperty('clanAdmin')) {
		console.log('problem');
		console.log(data);
		return false;
	}

	// Create a token
	var token = jwt.sign({
		username: data.username,
		gamename: data.gamename,
		clan: data.clan,
		clanAdmin: data.clanAdmin
	}, TOKEN_SECRET,
	{ expiresIn: 172800 // expires in 2 days 
	// { expiresIn: 720 // expires in 2 hours (This is for mean sites)
	// { expiresIn: 10 // expires in 10 seconds (This is for debugging)
	});

	return token;
};

/* ======================== AMAZON DYNAMODB QUERIES ======================== */

// USER QUERIES
var getUser = function (username) {
	return new Promise(function(resolve, reject) {
		dynamodb.query({
			TableName : "Users",
			KeyConditionExpression: "username = :1",
			ExpressionAttributeValues: {
				":1": { 'S': username }
			}
		}, function(err, data) {
			if (err) {
				reject ({
					success: false,
					message: 'Database Error. Try again later.',
					err: err
				});
			} else {
				if (data.Count == 0) {
					reject ({
						success: false,
						message: 'Query Failed. User not found.'
					});
				} else {
					resolve (
						convertData(data.Items[0])
					);
				}
			}
		});
	});
};

var updateUser = function (username, data) {
	console.log("Updating User");
	console.log(username);
	console.log(data);

	// Initialize and assign attributes to be written to DynamoDB
	updateExp = 'set';
	expAttNames = {};
	expAttVals = {};

	// Only update the values the server is passed, 
	// and don't try to update things that do not exist
	if (data.clan) {
		updateExp += ' #name1 = :val1,';
		expAttNames['#name1'] = 'clan';
		expAttVals[':val1'] = data.clan;
	} 
	// if (data.size) {
	// 	updateExp += ' #name2 = :val2,';
	// 	expAttNames['#name2'] = 'size';
	// 	expAttVals[':val2'] = data.size;
	// } if (data.start) {
	// 	updateExp += ' #name3 = :val3,';
	// 	expAttNames['#name3'] = 'start';
	// 	expAttVals[':val3'] = data.start;
	// } if (data.exp) {
	// 	updateExp += ' #name4 = :val4,';
	// 	expAttNames['#name4'] = 'exp';
	// 	expAttVals[':val4'] = data.exp;
	// } if (data.ourDest) {
	// 	updateExp += ' #name5 = :val5,';
	// 	expAttNames['#name5'] = 'ourDest';
	// 	expAttVals[':val5'] = data.ourDest;
	// } if (data.theirDest) {
	// 	updateExp += ' #name6 = :val6,';
	// 	expAttNames['#name6'] = 'theirDest';
	// 	expAttVals[':val6'] = data.theirDest;
	// } if (data.ourScore) {
	// 	updateExp += ' #name7 = :val7,';
	// 	expAttNames['#name7'] = 'ourScore';
	// 	expAttVals[':val7'] = data.ourScore;
	// } if (data.theirScore) {
	// 	updateExp += ' #name8 = :val8,';
	// 	expAttNames['#name8'] = 'theirScore';
	// 	expAttVals[':val8'] = data.theirScore;
	// } if (data.outcome) {
	// 	updateExp += ' #name9 = :val9,';
	// 	expAttNames['#name9'] = 'outcome';
	// 	expAttVals[':val9'] = data.outcome;
	// } if (data.img) {
	// 	updateExp += ' #name10 = :val10,';
	// 	expAttNames['#name10'] = 'img';
	// 	expAttVals[':val10'] = data.img;
	// }

	// if (data.password) {  // Then we need to change the password
	// 	updateExpression = updateExpression + ', password = :val5';
	// 	expressionAttributeValues[':val5'] = bcrypt.hashSync(data.password);
	// }

	// Cut off the last ',' in the list
	updateExp = updateExp.slice(0, -1);

	console.log(username);
	console.log(expAttNames);
	console.log(expAttVals);

	dynamodbDoc.update({
		TableName: 'Users',
		Key: {
			username : username
		},
		UpdateExpression: updateExp,
		ExpressionAttributeNames: expAttNames,
		ExpressionAttributeValues: expAttVals
	}, function(err, data) {
		if (err) {
			console.log(err);
			return {
				success: false,
				message: err.message
			};
		} else {
			return {
				success: true,
				message: 'Successfully Updated User'
			};
		}
	});
};

// CLAN QUERIES
var createClan = function (data) {

	return new Promise(function(resolve, reject) {

		// Create the user in their own clan
		members = {}
		members[data.userData.username] = data.userData;
		members[data.userData.username].position = 'Leader';

		dynamodbDoc.put({
			TableName: 'Clans',
			Item: {
				ref : data.ref,
				name : data.name,
				totalWars : data.totalWars,
				warsWon : data.warsWon,
				wars : {},
				members : members,
				notInClan : {},
				totalMembers : 1
			},
			Expected: {
				'ref' : { 'Exists' : false },
			}
		}, function(err, data) {
			if (err) {
				reject ({ 
					success: false, 
					message: err
				}); 
			} else {
				resolve ({ 
					success: true,
					message: 'Clan created!'
				});
			}
		});
	});
};

// var findClan = function (ref) {

// 	console.log("ALMOST");

// 	return new Promise(function(resolve, reject) {

// 		dynamodb.query({
// 			TableName : 'Clans',
// 			KeyConditionExpression: '#1 = :1',
// 			ExpressionAttributeNames: {
// 				'#1': 'ref'
// 			},
// 			ExpressionAttributeValues: {
// 				':1': { 'S': ref }
// 			}
// 		}, function(err, data) {
// 			if (err) {
// 				reject ({
// 					success: false,
// 					message: 'Database Error. Try again later.',
// 					err: err
// 				});
// 			}

// 			if (data.Count == 0) {  // Then the reference must have been incorrect
// 				reject ({
// 					success: false,
// 					message: 'Clan Reference ' + ref + ' not found'
// 				});
// 			} else {
// 				resolve ({
// 					success: true,
// 					message: 'Successfully found Clan',
// 					data: convertData(data.Items[0])
// 				});
// 			}
// 		});
// 	});
// };

// var updateClan = function(ref, data) {
// 	return new Promise(function(resolve, reject) {

// 	});
// }

var joinClan = function(ref, data) {
	return new Promise(function(resolve, reject) {
		console.log(ref);
		console.log(data);

		dynamodbDoc.update({
			TableName: 'Clans',
			Key:{
				'ref': ref
			},
			UpdateExpression: 'set notInClan.#1 = :1',
			ExpressionAttributeNames: {
				'#1': data.username 
			},
			ExpressionAttributeValues: {
				':1': {
					banned: false,
					banReason: 'null',
					joinReq: true,
					joinMessage: 'Not Implemented Yet'
				}
			}
		}, function(err, data) {
			if (err) {
				reject ({
					success: false,
					message: err.message
				});
			} else {
				resolve ({
					success: true,
					message: 'Successfully Requested to Join'
				});
			}
		});
	});
}

// RANDOMDATA QUERIES
var getRandomData = function (name) {
	return new Promise(function(resolve, reject) {
		// Query the database to get all the taken IDs
		dynamodb.query({
			TableName : 'RandomData',
			KeyConditionExpression: '#1 = :1',
			ExpressionAttributeNames: {
				'#1': 'name'
			},
			ExpressionAttributeValues: {
				':1': { 'S': name }
			}
		}, function(err, data) {
			if (err) {
				reject ({
					success: false,
					message: 'Database Error. Try again later.'
				});
			} else {
				resolve({
					success: true,
					message: 'RandomData Returned',
					data: convertData(data.Items[0])
				});
			}
		});
	});
};

var updateRandomDataRef = function (ref) {
	console.log('Updating Ref: ' + String(ref));
	return new Promise(function(resolve, reject) {

		dynamodbDoc.update({
			TableName: 'RandomData',
			Key:{
				'name': 'takenRefs'
			},
			UpdateExpression: 'set refs.#1 = :1',
			ExpressionAttributeNames: {
				'#1' : ref
			},
			ExpressionAttributeValues: {
				':1' : true
			}
		}, function(err, data) {
			if (err) {
				console.error("Unable to change ID status. Error JSON:", JSON.stringify(err, null, 2));
				reject ({
					success: false, 
					message: err.message
				});
			} else {
				console.log('Ref successfully added');
				resolve ({
					success: true, 
					message: "Added the new Clan Reference to the database"
				});
			}
		});
	});
};

/* ================================ ROUTING ================================ */

module.exports = function(app, express, $http) {

	// Get an instance of the express router
	var apiRouter = express.Router();

	apiRouter.use(function(req, res, next) {
		console.log('Request to API: ' + req.path);
		next();
	});

	// ============================ PUBLIC APIS ============================ //

	
	apiRouter.route('/authenticate')
	// route to authenticate a user (POST http://localhost:8080/api/authenticate)
	.post(function(req, res) {
		// find the user
		getUser(req.body.username)
			.then(function(user) {

				// check if password matches
				var validPassword = bcrypt.compareSync(req.body.password, user.password);

				if (!validPassword) {
					return res.json({
						success: false,
						message: 'Incorrect Password'
					});
				} else {
					
					// This code will be removed once the site goes live, however, 
					// the 'siteAdmin' field will be useful for future code
					if (!user.siteAdmin) {
						return res.json({
							success: false,
							message: 'Application is still under construction, try again in September 2016'
						});
					}

					// create a token
					token = createToken(user);

					// return the information including token as JSON
					return res.json({
						success: true,
						message: 'Successfully logged in', 
						token: token
					});
				}
			})
			.catch(function(err) {
				return res.json({
					success: false,
					message: 'Could not find that username'
				});
			});
	});

	apiRouter.route('/users')
	// create a user (accessed at POST /api/users)
	.post(function(req, res) {

		db.createUser(req.body).then(function() {
			return res.json({
				success: true,
				message: "UHHH CHANGE THIS"
			});
		});
	});
	
	apiRouter.route('/partialClan/:clan_ref')
	// Get the clan information for display purposes (accessed at GET http://localhost:8080/api/partialClan)
	.get(function(req, res) {
		ref = '@' + req.params.clan_ref;

		db.getClan(ref)
			.then(function(data) {
				// Found the clan, but only return limited information
				clan = {
					name: data.data.name,
					ref: data.data.ref,
					totalMembers: data.data.totalMembers,
					warsWon: data.data.warsWon
				}

				return res.json({
					success: true,
					message: data.message,
					data: clan
				});
			})
			.catch(function(data) {
				// return res.status(500).send({ error: 'Something failed!' });
				return res.json({
					success: false,
					message: data.message
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

	// =========================== LOGGED IN APIS =========================== //

	// API endpoint to get user information
	apiRouter.get('/me', function(req, res) {
		res.send(req.decoded);
	});

	apiRouter.route('/clans')
	// create a clan (accessed at POST http://clan.solutions/api/clans)
	.post(function(req, res) {

		// Check to see if the client has provided all necessary information
		if (!req.body.name || !req.body.totalWars || !req.body.warsWon) {
			return res.json({ 
				success: false,
				message: 'Missing necessary attributes of Clan'
			});
		}

		// Create a high-level scope for these variables
		ref = null;
		userData = null;

		getRandomData('takenRefs')
			// Generate a random reference, checking against all refs just pulled from the database
			.then(function(data) {

				refs = data.data.refs;

				// Randomly generate a Hexidecimal ID, 4 characters long
				ref = '@'+ ('0000' + Math.floor(Math.random()*65536).toString(16).toUpperCase()).slice(-4);

				// Check the generated ID against all existing IDs
				while (refs[ref]) {
					// If we are here, then we have a conflict, incrememnt the ID and check again
					var newRefNum = parseInt(ref.slice(-4), 16) + 1;
					if (newRefNum > 65535)
						newRefNum = 0;
					ref = '@' + ('0000' + newRefNum.toString(16).toUpperCase()).slice(-4);
				}
				console.log('New Ref Found: ' + String(ref));
				return ref;
			})
			// Now that a unique reference has been generated, push it back to the database
			.then(function(ref) {
				return updateRandomDataRef(ref)
			})
			// Grab the current user from the database so we can write their information to the new clan
			.then(function() {
				return getUser(req.body.username);
			})
			// Create the new clan with the reference from earlier and the userData we just got
			.then(function(data) {
				userData = data;  // Expand the scope of userData

				// Modify userData slightly before passing it to createClan
				delete userData.password;
				delete userData.dateJoinedSite;
				now = new Date();
				userData.dateJoinedClan = now.getTime();

				data = {
					userData : userData,
					ref : ref,
					name : req.body.name,
					totalWars : req.body.totalWars,
					warsWon : req.body.warsWon
				};
				return createClan(data);
			})
			.then(function() {
				// Clan was successfully created, update the user who created the clan
				updateUser(userData.username, {
					clan: ref
				});

				token = createToken({
					username: userData.username,
					gamename: userData.gamename,
					clanAdmin: true,
					clan: ref
				});

				return res.json({
					success : true,
					message : 'Clan Successfully Created',
					token : token
				});
			})
			.catch(function(err) {
				console.error('Failed to create clan. Error JSON:', JSON.stringify(err, null, 2));
				return res.json({
					success: false,
					message: 'Database Error. Try again later.'
				});
			});
	});

	apiRouter.route('/clans/join/:clan_ref')
	// join a clan (accessed at PUT http://clan.solutions/api/clans/join)
	.put(function(req, res) {

		joinClan(req.params.clan_ref, req.decoded)
			.then(function(data) {
				return res.json({
					success: true,
					message: data.message
				});
			})
			.catch(function(data) {
				return res.json({
					success: false,
					message: data.message
				});
			});
	});

	// apiRouter.route('/partialWars')
	// // get all the wars for a clan (accessed at GET http://localhost:8080/api/users)
	// .get(function(req, res) {

	// 	dynamodb.scan({
	// 		TableName : "Wars",
	// 		ProjectionExpression: "createdAt, #1, outcome, ourScore, theirScore, exp, img",
	// 		ExpressionAttributeNames: {
	// 			"#1": "start"
	// 		},
	// 		Limit : 1000
	// 	}, function(err, data) {
	// 		if (err) { 
	// 			return res.json({
	// 				success: false,
	// 				message: 'Database Error. Try again later',
	// 			});
	// 		} else {
	// 			data = convertData(data.Items);

	// 			res.json({
	// 				success: true,
	// 				message: 'Successfully returned all Wars',
	// 				data: data
	// 			});
	// 		}
	// 	});
	// });

	apiRouter.route('/partialUsers')
	// get all the users (accessed at GET http://localhost:8080/api/users)
	.get(function(req, res) {
		ref = req.decoded.clan.slice(-4);
		console.log(ref);
		dynamodb.query({
			TableName : 'Clans',
			ProjectionExpression: '#1, #2',
			KeyConditionExpression: '#1 = :1',
			ExpressionAttributeNames: {
				'#1' : 'ref',
				'#2' : 'users',
			},
			ExpressionAttributeValues: {
				':1': { 'S': ref }
			}
		}, function(err, data) {
			if (err) { 
				console.log(err);
				return res.json({
					success: false,
					message: 'Database Error. Try again later.',
				});
			}

			if (data.Count == 0) {  // Then the query came back empty
				return res.json({
					success: false,
					message: 'Query Failed.'
				});
			} else {
				data = convertData(data.Items);
				console.log(data);

				res.json({
					success: true,
					message: 'Successfully returned all Users',
					data: data
				});
			}
		});
	});


	apiRouter.route('/wars')
	// Get all Wars
	.get(function(req, res) {

		db.getClan(req.decoded.clan)
		.then(function(data) {
			res.json({
				success : true,
				message : 'TBA',
				data : data.data.wars
			});
		})
		.catch(function(err) {
			res.json({
				success : false,
				message : 'TBA'
			});
		});
	});


	apiRouter.route('/wars/:war_id')
	// (accessed at GET http://localhost:8080/api/wars/:war_id) 
	.get(function(req, res) {

		db.getClan(req.decoded.clan)
		.then(function(data) {


			var wars = data.data.wars;

			// console.log(wars);
			console.log(wars[req.params.war_id])


			// console.log(wars[]);


			res.json({
				success : true,
				message : 'Successfully found war',
				data : data
			});
		})
		.catch(function(err) {
			res.json({
				success : false,
				message : err.message
			});
		});
	})

	// Update War
	.put(function(req, res) {
		// HOLY SHIT COME BACK AND FIX THIS SOON
		db.updateWar(req.decoded.clan, req.params.war_id, req.body)
		.then(function(data) {
			res.json({
				success : true,
				message : 'War Updated'
			});
		})
		.catch(function(err) {
			res.json({
				success : false,
				message : err.message
			});
		});
	});

	// SPECIFIC USERS PROFILE //
	apiRouter.route('/users/profile/:username')
	// Read User
	.get(function(req, res) {
		dynamodb.query({
			TableName : 'Users',
			KeyConditionExpression: '#1 = :val',
			ExpressionAttributeNames: {
				'#1': 'username'
			},
			ExpressionAttributeValues: {
				':val': { 'S': req.params.username }
			}
		}, function(err, data) {

			if (err) {
				return res.json({
					success: false,
					message: 'Database Error. Try again later.',
					data: err
				});
			}

			if (data.Count == 0) {
				return res.json({
					success: false,
					message: 'Query Failed. User not found.'
				});
			} else {

				// Convert Data before sending it back to client
				data = convertData(data.Items[0]);
				delete data.password; // This is important... Well, it's hashed, but still

				// Convert a few values before returning
				data.thLvl = Number(data.thLvl);
				data.kingLvl = Number(data.kingLvl);
				data.queenLvl = Number(data.queenLvl);
				data.kingFinishDate = Number(data.kingFinishDate);
				data.queenFinishDate = Number(data.queenFinishDate);

				// Add a few values if they don't exist
				// REMOVE THIS once all profiles have been updated
				if (!data.kingFinishDate)
					data.kingFinishDate = 0;
				if (!data.queenFinishDate)
					data.queenFinishDate = 0;

				if (data.kingFinishDate != 0) {
					now = new Date();
					difference = data.kingFinishDate - now;

					data.kingTimeMinute = Math.floor(difference / (60 * 1000)) % 60;
					data.kingTimeHour = Math.floor(difference / (60 * 60 * 1000)) % 24;
					data.kingTimeDay = Math.floor(difference / (24 * 60 * 60 * 1000));
				}
				if (data.queenFinishDate != 0) {
					now = new Date();
					difference = data.queenFinishDate - now;

					data.queenTimeMinute = Math.floor(difference / (60 * 1000)) % 60;
					data.queenTimeHour = Math.floor(difference / (60 * 60 * 1000)) % 24;
					data.queenTimeDay = Math.floor(difference / (24 * 60 * 60 * 1000));
				}
				
				// The list of wars someone has participated in need to be compacted into a single array
				data.wars = []
				for (item in data) {
					if (!isNaN(item)) {  // We only care about the numbers, as they represent wars
						data.wars.push({
							'start' : data[item].start,
							'createdAt' : item,
							'opponent' : data[item].opponent,
							'stars' : data[item].attack1.stars,
							'you' : data[item].warPos,
							'opp' : data[item].attack1.targetPos,
						});
						data.wars.push({
							'start' : data[item].start,
							'createdAt' : item,
							'opponent' : data[item].opponent,
							'stars' : data[item].attack2.stars,
							'you' : data[item].warPos,
							'opp' : data[item].attack2.targetPos,
						});

						delete data[item]			   // Delete this entry from 'data'
					}
				}

				// Sort the list of wars by start time
				data.wars.sort(function(a, b) {
					return (Number(a.start) > Number(b.start)) ? -1 : (Number(a.start) < Number(b.start)) ? 1 : 0;
				});

				res.json({
					success: true,
					message: 'Successfully returned user',
					data: data
				});
			}
		});
	})

	// Update User
	.put(function(req, res) {

		// IS THIS NECESSARY? RECONSIDER. CODE DOES NOT BREAK IF USERNAME IS UNDEFINED
		// Check that the username has been provided
		if (typeof(req.params.username) != 'string') {
			return res.json({
				success : false,
				message : 'Invalid username provided: ' + req.params.username
			});
		}

		// Check permissions on this call
		if (req.decoded.username != req.params.username &&
			req.decoded.clanAdmin != true) {
			return res.json({
				success : false,
				message : 'You do not have permission to alter the user: ' + req.params.username
			});
		}

		// Update the user
		db.updateUser(req.params.username, req.body)
		.then(function(data) {
			res.json({
				success : true,
				message : 'User Updated'
			});
		})
		.catch(function(err) {
			res.json({
				success : false,
				message : 'Database error. Sorry for the inconvenience. Please try again.'
			});
		});
	});

	// ============================= CLAN APIS ============================= //

	apiRouter.route('/clan/:clan_ref')
	// Get a Particular Clan
	.get(function(req, res) {
		// Add a check for clan authentication, need that

		ref = '@' + req.params.clan_ref;

		db.getClan(ref)
		.then(function(data) {
			return res.json({
				success: true,
				message: data.message,
				data: data.data
			});
		})
		.catch(function(data) {
			// return res.status(500).send({ error: 'Something failed!' });
			return res.json({
				success: false,
				message: data.message
			});
		});
	});

	// ======================== ADMIN AUTHENTICATION ======================== //

	// route middleware to verify the token is owned by an admin
	apiRouter.use(function(req, res, next) {

		if (req.decoded.clanAdmin) {
			next();
		} else {
			return res.status(403).send({
				error: {},  // This is here for code in AuthService, DO NOT REMOVE
				success: false,
				message: 'Failed to authenticate token.'
			});
		}
	});

	// ============================= ADMIN APIS ============================= //

	apiRouter.route('/lastWar/:size')
	.get(function(req, res) {

		console.log("JUST ABOUT");

		db.getClan(req.decoded.clan)
		.then(function(data) {

			console.log("MADE IT");

			console.log(data);

			var wars = data.data.wars;

			for (i in wars.length) {
				// Implement when there are wars to iterate over
			}

			// console.log(data.message);

			return res.json({
				success: false,
				message: "Successfully found a similar war",
				data: null
			});
		})
		.catch(function(data) {

			console.log("FAILURE");

			// return res.status(500).send({ error: 'Something failed!' });
			return res.json({
				success: false,
				message: data.message
			});
		});

		// req.params.size
	});

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
			data = convertData(data.Items);

			res.json({
				success: true,
			    message: 'Successfully returned all Users',
				data: data
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
				
				data = convertData(data.Items[0]);

				res.json({
					success: true,
					message: 'Successfully returned user',
					data: data
				});
			}
		});
	})

	// Update User
	.put(function(req, res) {

		updateExpression = 'set id = :val1, title = :val2, inClan = :val3, admin = :val4';
		expressionAttributeValues = {
			':val1' : req.body.id,
			':val2' : req.body.title,
			':val3' : req.body.inClan,
			':val4' : req.body.admin
		}

		if (req.body.password) {  // Then we need to change the password
			updateExpression = updateExpression + ', password = :val5';
			expressionAttributeValues[':val5'] = bcrypt.hashSync(req.body.password);
		}

		dynamodbDoc.update({
			TableName: 'Users',
			Key:{
				'name': req.body.name
			},
			UpdateExpression: updateExpression,
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
					message: 'Successfully Updated User'
				});
			}
		});
	})

	// Delete User
	.delete(function(req, res) {
		console.log(req.decoded.name);
		if (req.decoded.name != 'Zephyro') {  // Little Fail-Safe for now.. Must be ME
			return res.json({ 
					success: false,
					message: 'You do not have permission to do this.'
			}); 
		}
		dynamodbDoc.delete({
			TableName: 'Users',
			Key:{
				'name': req.params.user_id
			}
		}, function(err, data) {
			if (err) {
				console.error('Unable to delete User. Error JSON:', JSON.stringify(err, null, 2));
				return res.json({ 
					success: false,
					message: err.message
				}); 
			} else {
				res.json({ 
					success: true,
					message: 'User Deleted' 
				});
			}
		});
	});

	apiRouter.route('/wars')
	// create a war (accessed at POST http://localhost:8080/api/wars)
	.post(function(req, res) {

		// Check to make sure the client has sent all the necessary information
		if (req.body.opponent && 
			req.body.start && 
			req.body.size
			) {
			if (!req.body.inProgress) {
				if (req.body.exp && 
					req.body.ourScore && 
					req.body.theirScore && 
					req.body.ourDest && 
					req.body.theirDest && 
					req.body.outcome &&
					req.body.warriors) {
					// Then all the attributes we need exist
				} else {
					return res.json({ 
						success: false,
						message: 'Missing necessary attributes of war' 
					});
				}
			}
			// Then all the attributes we need exist
		} else {
			return res.json({ 
				success: false,
				message: 'Missing necessary attributes of war' 
			});
		}

		// set the war information (comes from the request)
		// Required information //

		now = new Date();
		var war = req.body;
		war.createdAt = now.getTime().toString();

		war.warriors = {};

		// Warriors are added separately, each as their own entry //
		for (var i = 0; i < req.body.warriors.length; i++) {
			// Need to delete these pesky fields
			delete req.body.warriors[i]['s1Opt1'];
			delete req.body.warriors[i]['s1Opt2'];
			delete req.body.warriors[i]['s1Opt3'];
			delete req.body.warriors[i]['s2Opt1'];
			delete req.body.warriors[i]['s2Opt2'];
			delete req.body.warriors[i]['s2Opt3'];

			war.warriors[i] = req.body.warriors[i];
		};

		db.createWar(req.decoded.clan, war)
		.then(function(data) {
			res.json({
				success: true,
				message: 'War created!'
			});
		})
		.catch(function(err) {
			res.json({
				success: false,
				message: err.message
			}); 
		});
	});

	return apiRouter;

};




