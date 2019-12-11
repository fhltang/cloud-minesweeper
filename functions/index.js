const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp()

// Collections
const GAMES = 'games';

exports.newGame = functions.https.onCall((data, context) => {
    const uid = context.auth.uid;
    const name = context.auth.token.name || null;
    const picture = context.auth.token.picture || null;
    const email = context.auth.token.email || null;

    return admin.firestore().collection(GAMES).add({
        creator: uid,
        board: {
            rows: [
                {cols: [0, 0, 0]},
                {cols: [0, 0, 0]},
                {cols: [0, 0, 0]}
            ]
        }
    }).then(doc => {
        return {
            gameId: doc.id
        };
    }).catch(function(error) {
        throw new functions.https.HttpsError('failed-precondition', 'Failed to create new game: ' + error)
    });
});
