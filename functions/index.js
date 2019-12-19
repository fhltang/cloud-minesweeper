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
    let gameRef = db.collection(GAMES).doc();
    var gameId = gameRef.id;

    let batch = db.batch();
    batch.create(gameRef, {
        created: new Date().getTime(),
        creator: uid,
        moves: [],
        board: publicBoard
    });
    batch.create(db.collection(GAMES_HIDDEN).doc(gameId), board);
    batch.create(gameRef.collection(PLAYERS).doc(uid), {
        name: name,
        picture: picture,
        email: email,
        score: 0
    });

    return batch.commit().then(() => {
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
    const gameId = data.gameId || null;

    if (gameId === null) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing gameId');
    }

    var db = admin.firestore();
    let game = null;
    return db.runTransaction(t => {
        return t.get(db.collection(GAMES).doc(gameId)).then((gameDoc) => {
            if (!gameDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'Unknown gameId ' + gameId);
            }
            game = gameDoc;
            return t.get(db.collection(GAMES_HIDDEN).doc(gameId));
        }).then((hiddenGameDoc) => {
            if (!hiddenGameDoc.exists) {
                throw new functions.https.HttpsError('internal', 'Game state inconsistent (missing hidden board) for gameId ' + gameId);
            }
            return t.set(game.ref.collection(PLAYERS).doc(uid), {
                name: name,
                picture: picture,
                email: email,
                score: 0
            });
        });
    }).then(() => {
        return {'gameId': gameId};
    }).catch((error) => {
        throw new functions.https.HttpsError('failed-precondition', 'Failed to join game: ' + error);
    });
});

// data = {gameId: ..., reveal: {row: ..., col: ...}}
// result = {moves: [{row:, col:}, ...]}
exports.playMove = functions.https.onCall((data, context) => {
    const uid = context.auth.uid;

    var db = admin.firestore();

    let moves = [];
    let gameId = data.gameId || null;

    if (gameId === null) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing gameId');
    }

    let transaction = db.runTransaction(t => {
        let score = 0;
        let game = null;
        let hiddenGame = null;
        let hiddenBoard = null;
    
        // Check if gameId is valid
        return t.get(db.collection(GAMES).doc(gameId)).then((gameDoc) => {
            game = gameDoc;
            if (!game.exists) {
                throw new functions.https.HttpsError('not-found', 'Cannot find game ' + gameId);
            }

            return t.get(db.collection(GAMES_HIDDEN).doc(gameId));
        }).then((hiddenGameDoc) => {
            hiddenGame = hiddenGameDoc;
            if (!game.exists) {
                throw new functions.https.HttpsError('internal', 'Game state inconsistent (missing hidden board) for gameId ' + gameId);
            }

            hiddenBoard = hiddenGame.data();
            return t.get(game.ref.collection(PLAYERS).doc(uid));
        }).then((player) => {
            if (!player.exists) {
                throw new functions.https.HttpsError('permission-denied', 'Player ' + uid + ' has not joined game ' + gameId);
            }

            score = player.data().score;

            let board = game.data().board;

            if (data.reveal.row < 0 || data.reveal.row >= board.height) {
                throw new functions.https.HttpsError('invalid-argument', 'Row ' + data.reveal.row + ' out of range');
            }
            if (data.reveal.col < 0 || data.reveal.col >= board.width) {
                throw new functions.https.HttpsError('invalid-argument', 'Col ' + data.reveal.col + ' out of range');
            }

            let rows = board.rows;
            if (rows[data.reveal.row].cols[data.reveal.col] !== HIDDEN) {
                throw new functions.https.HttpsError('invalid-argument', 'Tile (' + data.reveal.row + ', ' + data.reveal.col + ') is not hidden');
            }

            // queue for BFS
            let queue = [data.reveal];
            while (queue.length > 0) {
                let move = queue.shift();
                if (rows[move.row].cols[move.col] !== HIDDEN) {
                    // Ignore trying to reveal a non-hidden tile.
                    // This may happen because our BFS of tiles may hit the same tile more than once.
                    continue;
                }

                moves.push(move);
                rows[move.row].cols[move.col] = hiddenBoard.rows[move.row].cols[move.col];

                score += (hiddenBoard.rows[move.row].cols[move.col] === MINE) ? -10 : 1;

                if (hiddenBoard.rows[move.row].cols[move.col] !== 0) {
                    continue;
                }

                let deltas = [[-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1]];
                for (let i = 0; i < deltas.length; i++) {
                    let delta = deltas[i];
                    let cr = move.row + delta[0];
                    let cc = move.col + delta[1];
                    if (0 <= cr && cr < board.height && 0 <= cc && cc < board.width) {
                        if (rows[cr].cols[cc] === HIDDEN) {
                            queue.push({row: cr, col: cc});
                        }
                    }
                }
            }
            return t.update(game.ref, 'board.rows', rows);
        }).then(() => {
            let userMoves = game.data().moves || [];
            userMoves.push({row: data.reveal.row, col: data.reveal.col});
            return t.update(game.ref, 'moves', userMoves);
        }).then(() => {
            return t.update(game.ref.collection(PLAYERS).doc(uid), 'score', score);
        });
    }).then(result => {
        console.log('Transaction successful');
        return {moves: moves};
    }).catch(err => {
        console.log('Transaction failure boo hoo:', err);
        throw new functions.https.HttpsError('internal', 'Transaction failure: ' + err);
    });

    return transaction;
});