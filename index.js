import {
  RefreshingAuthProvider
} from '@twurple/auth';
import {
  ChatClient
} from '@twurple/chat';
import {
  promises as fs
} from 'fs';
import {
  PubSubClient,
  PubSubSubscriptionMessage
} from '@twurple/pubsub';
import SpotifyWebApi from 'spotify-web-api-node';
import readline from 'readline';


const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

var isLive = false;

async function main() {
  const config = JSON.parse(await fs.readFile('./config.json', 'UTF-8'));
  const tokenData = JSON.parse(await fs.readFile('./tokens.json', 'UTF-8'));
  const spotifyApi = await spotifyConnect(config);
  let clientId = config.twitch.clientId;
  let clientSecret = config.twitch.clientSecret;
  const authProvider = new RefreshingAuthProvider({
      clientId,
      clientSecret,
      onRefresh: async newTokenData => await fs.writeFile('./tokens.json', JSON.stringify(newTokenData, null, 4), 'UTF-8')
    },
    tokenData
  );

  const chatClient = new ChatClient({
    authProvider,
    channels: config.twitch.channels
  });
  const pubSubClient = new PubSubClient();
  console.log('connecting...');
  await chatClient.connect();
  console.log('connected!');
  const userId = await pubSubClient.registerUserListener(authProvider);
  const listener = await pubSubClient.onSubscription(userId, (message) => {
    console.log(`${message} just subscribed!`);
  });
  await pubSubClient.onRedemption(userId, (redeem) => {
    console.log(redeem);
    console.log(`${redeem.userDisplayName} has redeemed ${redeem.rewardTitle} for ${redeem.rewardCost} with the message: ${redeem.message}`);
    if (`${redeem.rewardTitle}` == 'Next Song') {
      if(isLive) spotifyApi.skipToNext();
    }
  });


  chatClient.onMessage((channel, user, message) => {
    console.log(message);
    if (message === '!ping') {
      chatClient.say(channel, 'Pong!');
    } else if (message === '!dice') {
      const diceRoll = Math.floor(Math.random() * 6) + 1;
      chatClient.say(channel, `@${user} rolled a ${diceRoll}`)
    } else if (message === '!spotify'){
      isLive = !isLive;
      chatClient.say(channel, `Spotify controll is now ${isLive}`);
      console.log(`Spotify controll is now ${isLive}`);
    }
  });

  chatClient.onSub((channel, user) => {
    // chatClient.say(channel, `Thanks to @${user} for subscribing to the channel!`);
  });
  chatClient.onResub((channel, user, subInfo) => {
    // chatClient.say(channel, `Thanks to @${user} for subscribing to the channel for a total of ${subInfo.months} months!`);
  });
  chatClient.onSubGift((channel, user, subInfo) => {
    // chatClient.say(channel, `Thanks to ${subInfo.gifter} for gifting a subscription to ${user}!`);
  });
  // await spotifyApi.skipToNext();
  // spotifyApi.getMe()
  //   .then(function (data) {
  //     console.log('Some information about the authenticated user', data.body);
  //   }, function (err) {
  //     console.log('Something went wrong!', err);
  //   });
}

async function spotifyConnect(config) {
  return new Promise(async function (resolve, reject) {
    const spotifyApi = new SpotifyWebApi({
      clientId: config.spotify.clientId,
      clientSecret: config.spotify.clientSecret,
      redirectUri: 'http://localhost'
    });
    // Create the authorization URL
    var authorizeURL = spotifyApi.createAuthorizeURL(config.spotify.scopes, 'random-state-to-match-request-and-response');
    console.log(authorizeURL);

    const code = await new Promise(resolve => {
      rl.question("Please post the code ", resolve)
    });
    // console.log(code);

    spotifyApi.authorizationCodeGrant(code).then(
      function (data) {
        console.log('The token expires in ' + data.body['expires_in']);
        // console.log('The access token is ' + data.body['access_token']);
        // console.log('The refresh token is ' + data.body['refresh_token']);

        // Set the access token on the API object to use it in later calls
        spotifyApi.setAccessToken(data.body['access_token']);
        spotifyApi.setRefreshToken(data.body['refresh_token']);
        setInterval(refreshToken, 1000 * 50 * 60, spotifyApi); // token needs refresh at least every 3600 seconds so 3000000 ms should be good
        resolve(spotifyApi);
      },
      function (err) {
        console.log('Something went wrong!', err);
        reject(err);
      }
    );
  });
}

function refreshToken(spotifyApi) {
  spotifyApi.refreshAccessToken().then(
    function (data) {
      console.log("The access token has been refreshed!");

      // Save the access token so that it's used in future calls
      spotifyApi.setAccessToken(data.body["access_token"]);
    },
    function (err) {
      console.log("Could not refresh access token", err);
    }
  );
}

main();