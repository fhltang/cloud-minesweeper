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

// data = {gameId: ...}
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

// data = {gameId: ..., reveal: {row: ..., col: ...}}
exports.playMove = functions.https.onCall((data, context) => {
    const uid = context.auth.uid;

    var db = admin.firestore();

    var game = null;

    // Check if gameId is valid
    return db.collection(GAMES).doc(data.gameId).get().then((gameDoc) => {
        game = gameDoc;
        if (!game.exists) {
            return new functions.https.HttpsError('not-found', 'Cannot find game ' + data.gameId);
        }

        return game.ref.collection(PLAYERS).doc(uid).get();
    }).then((player) => {
        if (!player.exists) {
            return new functions.https.HttpsError('permission-denied', 'Player ' + uid + ' is not playing in game ' + data.gameId);
        }

        var board = game.data().board;

        if (data.reveal.row < 0 || data.reveal.row >= board.rows.length) {
            return new functions.https.HttpsError('invalid-argument', 'Row ' + data.reveal.row + ' out of range');
        }
        if (data.reveal.col < 0 || data.reveal.col >= board.rows[data.reveal.row].cols.length) {
            return new functions.https.HttpsError('invalid-argument', 'Col ' + data.reveal.col + ' out of range');
        }

        // TODO: replace this fake implementation
        var newData = game.data();
        newData.board.rows[data.reveal.row].cols[data.reveal.col] = 1;
        return game.ref.set(newData)
    }).then(() => {
        return {};
    });
});