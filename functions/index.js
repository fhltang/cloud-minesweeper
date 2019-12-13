const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp()

// Collections
const GAMES = 'games';
const GAMES_HIDDEN = 'gamesHidden';
const PLAYERS = 'players';  // Subcollection of documents in GAMES.

// Tiles
const MINE = -1;
const FLAGGED = -2;
const HIDDEN = -3;

// data = {height: int, width: int, mines: int}
//
// prob is the probability any square has a mine
//
// result = {gameId: string}
exports.newGame = functions.https.onCall((data, context) => {
    const uid = context.auth.uid;
    const name = context.auth.token.name || null;
    const picture = context.auth.token.picture || null;
    const email = context.auth.token.email || null;

    const height = data.height || null;
    const width = data.width || null;
    const mines = data.mines || null;

    if (height === null || height < 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Bad height ' + height);
    }
    if (width === null || width < 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Bad width ' + width);
    }
    if (mines === null || mines < 0 || mines >= width * height) {
        throw new functions.https.HttpsError('invalid-argument', 'Bad mines ' + mines);
    }

    // Generate board
    let board = { rows: [] };
    for (let r = 0; r < height; r++) {
        var row = {cols: []};
        for (let c = 0; c < width; c++) {
            row.cols.push(0);
        }
        board.rows.push(row);
    }
    // Insert mines and update neighbouring cells
    let count = 0;
    for (let m = 0; m < mines; m++) {
        var r = Math.floor(Math.random() * height);
        var c = Math.floor(Math.random() * width);
        if (board.rows[r].cols[c] === MINE) {
            // There was already a mine there, oh well.
            continue;
        }
        count++;
        board.rows[r].cols[c] = MINE;
        for (let rd = -1; rd <= 1; rd++) {
            for (let cd = -1; cd <= 1; cd++) {
                if (rd === 0 && cd === 0) {
                    continue;
                }
                let rc = r + rd;
                let cc = c + cd;
                console.log('Checking ', rc, rd);
                if (0 <= rc && rc < height && 0 <= cc && cc < width) {
                    if (board.rows[rc].cols[cc] !== MINE) {
                        board.rows[rc].cols[cc] = board.rows[rc].cols[cc] + 1;
                    }
                }
            }
        }
    }

    // Generate public board
    let publicBoard = {
        height: height,
        width: width,
        mines: count,
        rows: []
    };
    for (let r = 0; r < height; r++) {
        let row = {cols: []};
        for (let c = 0; c < width; c++) {
            row.cols.push(HIDDEN);
        }
        publicBoard.rows.push(row);
    }

    let db = admin.firestore();
    var gameId = null;
    var gameRef = null;
    console.log('Public board:', publicBoard);
    return db.collection(GAMES).add({
        created: new Date().getTime(),
        creator: uid,
        board: publicBoard
    }).then(gameDoc => {
        gameId = gameDoc.id;
        gameRef = gameDoc;

        console.log('Private board:', board);
        return db.collection(GAMES_HIDDEN).doc(gameId).set(board);
    }).then(() => {
        // Add uid as a player
        return gameRef.collection(PLAYERS).doc(uid).set({
            name: name,
            picture: picture,
            email: email
        });
    }).then(() => {
        return {
            gameId: gameId
        };
    }).catch((error) => {
        console.error('Error: ', error);
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
    let game = null;
    return db.collection(GAMES).doc(gameId).get().then((gameDoc) => {
        if (!gameDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Unknown gameId ' + gameId);
        }
        game = gameDoc;
        return db.collection(GAMES_HIDDEN).doc(gameId).get();
    }).then((hiddenGameDoc) => {
        if (!hiddenGameDoc.exists) {
            throw new functions.https.HttpsError('internal', 'Game state inconsistent (missing hidden board) for gameId ' + gameId);
        }
        return game.ref.collection(PLAYERS).doc(uid).set({
            name: name,
            picture:picture,
            email:email
        });
    }).then(() => {
        return {'gameId': gameId};
    }).catch((error) => {
        return new functions.https.HttpsError('failed-precondition', 'Failed to join game: ' + error);
    });
});

// data = {gameId: ..., reveal: {row: ..., col: ...}}
// result = {moves: [{row:, col:}, ...]}
exports.playMove = functions.https.onCall((data, context) => {
    const uid = context.auth.uid;

    var db = admin.firestore();

    var game = null;
    var hiddenGame = null;
    var hiddenBoard = null;
    let moves = [];

    // Check if gameId is valid
    return db.collection(GAMES).doc(data.gameId).get().then((gameDoc) => {
        game = gameDoc;
        if (!game.exists) {
            throw new functions.https.HttpsError('not-found', 'Cannot find game ' + data.gameId);
        }

        return db.collection(GAMES_HIDDEN).doc(data.gameId).get();
    }).then((hiddenGameDoc) => {
        hiddenGame = hiddenGameDoc;
        if (!game.exists) {
            throw new functions.https.HttpsError('internal', 'Game state inconsistent (missing hidden board) for gameId ' + gameId);
        }

        hiddenBoard = hiddenGame.data();
        return game.ref.collection(PLAYERS).doc(uid).get();
    }).then((player) => {
        if (!player.exists) {
            throw new functions.https.HttpsError('permission-denied', 'Player ' + uid + ' has not joined game ' + data.gameId);
        }

        var board = game.data().board;

        if (data.reveal.row < 0 || data.reveal.row >= board.height) {
            throw new functions.https.HttpsError('invalid-argument', 'Row ' + data.reveal.row + ' out of range');
        }
        if (data.reveal.col < 0 || data.reveal.col >= board.width) {
            throw new functions.https.HttpsError('invalid-argument', 'Col ' + data.reveal.col + ' out of range');
        }

        let newData = game.data();
        // queue for BFS
        let queue = [data.reveal];
        while (queue.length > 0) {
            let move = queue.shift();
            if (newData.board.rows[move.row].cols[move.col] !== HIDDEN) {
                // Ignore trying to reveal a non-hidden tile.
                // This may happen because our BFS of tiles may hit the same tile more than once.
                continue;
            }

            moves.push(move);
            newData.board.rows[move.row].cols[move.col] = hiddenBoard.rows[move.row].cols[move.col];

            if (hiddenBoard.rows[move.row].cols[move.col] !== 0) {
                continue;
            }

            let deltas = [[-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1]];
            for (let i = 0; i < deltas.length; i++) {
                let delta = deltas[i];
                let cr = move.row + delta[0];
                let cc = move.col + delta[1];
                if (0 <= cr && cr < newData.board.height && 0 <= cc && cc < newData.board.width) {
                    if (newData.board.rows[cr].cols[cc] === HIDDEN) {
                        queue.push({row: cr, col: cc});
                    }
                }
            }
        }
        return game.ref.set(newData)
    }).then(() => {
        return {moves: moves};
    });
});