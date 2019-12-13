const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp()

// Collections
const GAMES = 'games';
const PLAYERS = 'players';  // Subcollection of documents in GAMES.

exports.newGame = functions.https.onCall((data, context) => {
    const uid = context.auth.uid;
    const name = context.auth.token.name || null;
    const picture = context.auth.token.picture || null;
    const email = context.auth.token.email || null;

    var gameId = null;

    return admin.firestore().collection(GAMES).add({
        created: new Date().getTime(),
        creator: uid,
        board: {
            rows: [
                {cols: [0, 0, 0]},
                {cols: [0, 0, 0]},
                {cols: [0, 0, 0]}
            ]
        }
    }).then(gameDoc => {
        gameId = gameDoc.id;
        return gameDoc.collection(PLAYERS).doc(uid).set({
            name: name,
            picture: picture,
            email: email
        });
    }).then(() => {
        return {
            gameId: gameId
        };
    }).catch((error) => {
        throw new functions.https.HttpsError('failed-precondition', 'Failed to create new game: ' + error)
    });
});

exports.joinGame = functions.https.onCall((data, context) => {
    const uid = context.auth.uid;
    const name = context.auth.token.name || null;
    const picture = context.auth.token.picture || null;
    const email = context.auth.token.email || null;
    const gameId = data.gameId;

    var db = admin.firestore();
    return db.collection(GAMES).doc(gameId).get().then((game) => {
        if (!game.exists) {
            return new functions.https.HttpsError('not-found', 'Unknown gameId ' + gameId);
        }

        return game.ref.collection(PLAYERS).doc(uid).set({
            name: name,
            picture:picture,
            email:email
        });
    }).then(() => {
        return {'gameId': gameId};
    }).catch((error) => {
        return new functions.https.HttpsError('failed-precondition', 'Failed to query database: ' + error);
    });
});