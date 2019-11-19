const { IgApiClient, IgCheckpointError } = require('instagram-private-api');
const ig = new IgApiClient();
const Bluebird = require('bluebird');
const inquirer = require('inquirer');
const moment = require('moment-timezone');
const { AsyncNedb } = require('nedb-async')

const db = {
	like: new AsyncNedb({
			filename: './database/like.db',
			autoload: true,
		}),
	follow: new AsyncNedb({
			filename: './database/follow.db',
			autoload: true,
		})
}

// Config
const username = "";
const password = "";

const tags = ["gamedev", "gameart", "indiegame"];

// Follow Classic
const followLimit = 2
const followLikeMax = 3

// Like Timeline
const pageLimit = 1;

// Defollow User
const waitTime = 3;

const timezone = "Asia/Jakarta";
const sleepTime = 60;
const maxLike = 500;
const maxFollow = 500;

var likeNow = 0;
var followNow = 0;

(async () => {
	ig.state.generateDevice(username) // + Math.random());
	//ig.state.proxyUrl = process.env.IG_PROXY;
	
	Bluebird.try(async () => {
		
		while(true) {
			// Login
			console.log("Sedang Login...");
			var auth = await ig.account.login(username, password);
				console.log("Logged:", auth.username);
			}
			
			// Count
			await countDB();
			
			// LikeTimelineMode
			await LikeTimeline();
			
			// FollowClassic
			await FollowClassic();
			
			// DefollowUser
			await DefollowUser();
			
			console.log("sleep for", sleepTime, "minutes");
			await sleep(sleepTime * 60);
		}
		
		
	}).catch(IgCheckpointError, async () => {
		console.log("Error type:", ig.state.checkpoint.error_type); // Checkpoint info here
		await ig.challenge.auto(true); // Requesting sms-code or click "It was me" button
		var { code } = await inquirer.prompt([
			{
				type: 'input',
				name: 'code',
				message: 'Enter code',
			},
		]);
		var result = await ig.challenge.sendSecurityCode(code)
		console.log("Status:", result.status);
	}).catch(e => {
		console.log("Unexpected error...", e);
	})
	
	
	
	
})();

async function countDB() {
	// Count
	var now = moment(moment().tz(timezone).format('YYYY-MM-DD')).format('X');
	var tomorrow = moment(moment().tz(timezone).add(1, 'days').format('YYYY-MM-DD')).format('X');
	
	likeNow = await db.like.asyncCount({ timestamp: {$gt: now, $lt: tomorrow} });
	followNow = await db.follow.asyncCount({ timestamp: {$gt: now, $lt: tomorrow} });
	
	console.log("Like today:", likeNow, "Follow today:", followNow);
}




async function LikeTimeline() {
	console.log("== Mode LikeTimeline ==")
	
	var page = 0;
	var timeline = await ig.feed.timeline("pagination")
	
	while(page < pageLimit) {
		console.log("Loading page", page + 1);
		
		var next = await timeline.isMoreAvailable();
		if (!next && page != 0) {
			console.log("No more to load");
			break;
		}
		
		var items = await timeline.items();
		
		for (var i=0; i<items.length; i++) {
			var likeResult = await like(items[i]);
			
			if (likeResult.status == "success") {
				console.log(`(${i + 1}/${items.length}) Success like from ${items[i].user.username}, (${likeNow}/${maxLike})`);
				await sleep(2)
				
			} else if (likeResult.status == "skip") {
				console.log(`(${i + 1}/${items.length}) ${likeResult.reason} ${items[i].user.username}, (${likeNow}/${maxLike})`);
				continue;
			}else if (likeResult.status == "limit") {
				console.log(likeResult.reason);
				break;
			}
		}
		
		page++
		await sleep(2)
	}
}



async function FollowClassic() {
	console.log("== Mode FollowClassic ==")
	
	var randomTags = tags[Math.floor(tags.length * Math.random())]
	console.log("Get item from", randomTags);
	
	var feed = await ig.feed.tags(randomTags, "recent");
	var following = 0;
	var page = 0;
	
	while(following < followLimit) {
		console.log("Loading page", page + 1);
		
		var next = await feed.isMoreAvailable();
		if (!next && page != 0) {
			console.log("No more to load");
			break;
		}
		
		var items = await feed.items();
		
		for (var i=0; i<items.length; i++) {
			if (following > (followLimit - 1)) {
				console.log(`Limit following for this mode reached`);
				break;
			}
			
			var result = await follow(items[i]);
			
			if (result.status == "success") {
				following++
				console.log(`(${following}/${followLimit}) Success follow ${items[i].user.username}, (${followNow}/${maxFollow})`);
				
				await sleep(2);
				
				var userFeed = await ig.feed.user(items[i].user.pk);
				var userItems = await userFeed.items();
				var currentLike = 0;
				
				for (var j=0; j<userItems.length; j++) {
					if (currentLike < followLikeMax) {
						var likeResult = await like(userItems[j]);
						currentLike++
						console.log(`----(${currentLike}/${followLikeMax}) Success like from ${items[i].user.username}, (${likeNow}/${maxLike})`);
						
						await sleep(2)
						
						if (likeResult.status == "limit") {
							console.log(likeResult.reason);
							break;
						}
					}
				}
				
				continue
			} else if (result.status == "databasefail") {
				console.log("DB error", result.error);
				continue
			} else if (result.status == "limit") {
				console.log(result.reason);
				return;
			}
		}
		
		page++
		await sleep(2)
		
	}
	
}

async function DefollowUser() {
	console.log("== Mode DefollowUser ==")
	
	var timestamp = moment().tz(timezone).subtract(waitTime, "minutes").format('X');
	var data = await db.follow.asyncFind({ status: "follow", timestamp: {$lt: timestamp} })
	data.reverse();
	console.log(timestamp, data);
	
	for (var i=0; i<data.length; i++) {
		try {
			var status = await ig.friendship.show(data[i].userpk)
			
			if (status.following) {
				
				var defollow = await ig.friendship.destroy(data[i].userpk)
				await db.follow.update( {_id: data[i]._id}, {$set: {status: "unfollow"}} );
				
				console.log("Berhasil defollow", data[i].username);
				
			} else {
				console.log("Not following", data[i].username);
				await db.follow.update( {_id: data[i]._id}, {$set: {status: "fail"}} );
			}
		} catch(e) {
			console.log("Account not found", data[i].username);
			await db.follow.update( {_id: data[i]._id}, {$set: {status: "error"}} );
		}
	}
	
	
	
	
}

async function follow(item) {
	var me = await ig.account.currentUser();
	
	// Filter
	if (item.user.friendship_status.following) {
		return {
			status: "skip",
			reason: "Already follow"
		}
	} else if (item.user.is_private) {
		return {
			status: "skip",
			reason: "Private user"
		}
	} else if (item.user.username == me.username) {
		return {
			status: "skip",
			reason: "Myself"
		}
	} else if (item.user.has_anonymous_profile_picture) {
		return {
			status: "skip",
			reason: "Anonymous profile picture"
		}
	} else if (followNow > maxFollow) {
		return {
			status: "limit",
			reason: "Limit reached"
		}
	} else {
		
		var follow = await ig.friendship.create(item.user.pk);
			
		var data = {
			username: item.user.username,
			userpk: item.user.pk,
			mediaId: item.id,
			status: "follow",
			timestamp: moment().tz(timezone).format('X')
		}
		
		await db.follow.asyncInsert(data)
				.catch(e => {
					return {
						status: "databasefail",
						error: e
					}
				});
		
		followNow++
		return {
			status: "success"
		}
	}
}

async function like(item) {
	var me = await ig.account.currentUser();
	
	// Filter
	if (item.has_liked) {
		return {
			status: "skip",
			reason: "Already liked"
		}
	} else if (item.user.is_private) {
		return {
			status: "skip",
			reason: "Private user"
		}
	} else if (item.user.username == me.username) {
		return {
			status: "skip",
			reason: "Myself"
		}
	} else if (item.user.has_anonymous_profile_picture) {
		return {
			status: "skip",
			reason: "Anonymous profile picture"
		}
	} else if (likeNow > maxLike) {
		return {
			status: "limit",
			reason: "Limit reached"
		}
	} else {
		
		var like = await ig.media.like({
			mediaId: item.id,
			moduleInfo: {
				module_name: 'feed_timeline'
			},
			d: 1
		});
		
		var data = {
			username: item.user.username,
			userpk: item.user.pk,
			mediaId: item.id,
			timestamp: moment().tz(timezone).format('X')
		}
		
		await db.like.asyncInsert(data)
				.catch(e => {
					return {
						status: "databasefail",
						error: e
					}
				});
		
		likeNow++
		return {
			status: "success"
		}
	}
}

///////

function sleep (sec) {
    return new Promise(resolve => setTimeout(resolve, sec * 1000));
}