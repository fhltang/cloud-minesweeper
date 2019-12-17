const HIDDEN = -3;
const FLAGGED = -2;
const MINE = -1;

// Constructor
// gameId - string
// game = {board: {height:..., width:..., rows: [{cols:...}]}, moves: [{row:..., col:...}, ...]}
// destElement - node in which to create table element
function Game(gameId, game, destElement) {
  // Take board state and update rendering without animation.
  this.fullUpdate = function(game) {
    let self = this;
    self.board = game.board;
    self.moveCount = (game.moves || []).length;
    for (let r = 0; r < self.board.rows.length; r++) {
      for (let c = 0; c < self.board.rows[r].cols.length; c++) {
        let span = self.spans[r][c];
        let button = self.buttons[r][c];
        if (self.board.rows[r].cols[c] === HIDDEN) {
          button.removeAttribute('hidden');
        } else if (self.board.rows[r].cols[c] === MINE) {
          button.setAttribute('hidden', 'true');
          span.removeAttribute('hidden');
          span.innerHTML = 'X';
        } else if (self.board.rows[r].cols[c] >= 0) {
          button.setAttribute('hidden', 'true');
          span.removeAttribute('hidden');
          if (self.board.rows[r].cols[c] > 0) {
            span.innerHTML = self.board.rows[r].cols[c];
          }
        }
      }
    }
  }

  // Try to render updated board state
  this.update = function(game) {
    let self = this;
    let newMoveCount = (game.moves || []).length;

    if (newMoveCount <= self.moveCount) {
      // Weird. Nothing has happened.
      return;
    }

    if (newMoveCount > self.moveCount + 1) {
      // There has been more than one move since the last rendering.  Give up and don't animate.
      return self.fullUpdate(game);
    }

    let queue = [game.moves[game.moves.length - 1]];
    (function animate() {
      if (queue.length === 0) {
        return;
      }
      console.log('animate', queue);
      let move = queue.shift();
      let r = move.row;
      let c = move.col;
      if (self.board.rows[r].cols[c] === game.board.rows[r].cols[c]) {
         return animate();
      }
         
      // Update state
      self.board.rows[r].cols[c] = game.board.rows[r].cols[c];
      // Update DOM elements.
      self.spans[r][c].removeAttribute('hidden');
      self.buttons[r][c].setAttribute('hidden', 'true');
      if (self.board.rows[r].cols[c] === MINE) {
        self.spans[r][c].innerHTML = 'X';
      } else if (self.board.rows[r].cols[c] > 0) {
        self.spans[r][c].innerHTML = self.board.rows[r].cols[c];
      }

      // do BFS of neighbours
      let deltas = [[-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1]];
      for (let i = 0; i < deltas.length; i++) {
          let delta = deltas[i];
          let cr = move.row + delta[0];
          let cc = move.col + delta[1];
          if (0 <= cr && cr < self.board.height && 0 <= cc && cc < self.board.width) {
              if (self.board.rows[cr].cols[cc] === HIDDEN && game.board.rows[cr].cols[cr] !== HIDDEN) {
                queue.push({row: cr, col: cc});
              }
          }
      }
      setTimeout(animate, 50);
    })();

    self.moveCount = (game.moves || []).length;

  }


  this.gameId = gameId;
  this.board = game.board;
  this.moveCount = (game.moves || []).length;

  // Array of arrays of span elements representing the revealed tile.
  this.spans = [];
  // Array of arrays of buttons which are clicked to reveal a tile.
  this.buttons = [];

  // Table element.
  this.table = document.createElement('table'); 

  for (let r = 0; r < game.board.height; r++) {
    let tr = document.createElement('tr');
    this.table.appendChild(tr);
    let srow = [];
    let brow = [];
    for (let c = 0; c < game.board.width; c++) {
      let td = document.createElement('td');
      tr.appendChild(td);
      let button = document.createElement('button');
      brow.push(button);
      td.appendChild(button);
      let span = document.createElement('span');
      span.setAttribute('hidden', 'true');
      srow.push(span);
      td.appendChild(span);

      button.addEventListener('click', () => {
        showWaiting();
        playMoveFunc({gameId: this.gameId, reveal: {row: r, col: c}}).then(() => {
          stopShowWaiting();
        });
      });
    }
    this.spans.push(srow);
    this.buttons.push(brow);
  }
  destElement.appendChild(this.table);

  this.fullUpdate(game);
}



function showWaiting() {
  bodyElement.classList.add('waiting');
}

function stopShowWaiting() {
  bodyElement.classList.remove('waiting');
}

function signIn() {
  var provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider);
}

function signOut() {
  firebase.auth().signOut();
}

function newGame() {
    showWaiting();
    newGameFunc({
      height: 10,
      width: 10,
      mines: 5
    }).then(result => {
        console.log('gameId: ', result.data.gameId);
        window.location.hash = '#' + result.data.gameId;
        inviteLinkElement.innerHTML = window.location.protocol + '//' + window.location.host + window.location.pathname +'#' + result.data.gameId;
        inviteElement.removeAttribute('hidden');
        subscribeGame(result.data.gameId, stopShowWaiting);
    });
}

function joinGame() {
    var gameId = window.location.hash.substring(1);
    showWaiting();
    joinGameFunc({'gameId': gameId}).then(result => {
        console.log('joined gameId: ', result.data.gameId);
        subscribeGame(result.data.gameId, stopShowWaiting);
    })
}

// onerror can handle initial errors, not transient errors
function subscribeGame(gameId, callback, onerror) {
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
    gameState = null;
    unsubscribe = firebase.firestore().collection(GAMES).doc(gameId)
    .onSnapshot((doc) => {
      if (gameState === null) {
        boardElement.innerHTML = '';
        gameState = new Game(gameId, doc.data(), boardElement);
        callback();
        return;
      }

      gameState.update(doc.data());
    }, (error) => {
      if (gameState === null && onerror) {
        onerror(error);
      }
    });
}

function initFirebaseAuth() {
  firebase.auth().onAuthStateChanged(authStateObserver);
}

// Returns the signed-in user's profile Pic URL.
function getProfilePicUrl() {
  return firebase.auth().currentUser.photoURL || '/images/profile_placeholder.png';
}

// Returns the signed-in user's display name.
function getUserName() {
  return firebase.auth().currentUser.displayName;
}

// Returns true if a user is signed-in.
function isUserSignedIn() {
  return !!firebase.auth().currentUser;
}

// Triggers when the auth state change for instance when the user signs-in or signs-out.
function authStateObserver(user) {
  if (user) { // User is signed in!
    // Get the signed-in user's profile pic and name.
    var profilePicUrl = getProfilePicUrl();
    var userName = getUserName();

    // Set the user's profile pic and name.
    userPicElement.style.backgroundImage = 'url(' + addSizeToGoogleProfilePic(profilePicUrl) + ')';
    userNameElement.textContent = userName;

    // Show user's profile and sign-out button.
    userNameElement.removeAttribute('hidden');
    userPicElement.removeAttribute('hidden');
    signOutButtonElement.removeAttribute('hidden');

    // Hide sign-in button.
    signInButtonElement.setAttribute('hidden', 'true');

    // Show new game button
    newGameButtonElement.removeAttribute('hidden');

    // Show join game button
    if (window.location.hash) {
      let gameId = window.location.hash.substring(1);
      subscribeGame(gameId, () => {
        joinGameButtonElement.setAttribute('hidden', 'true');
      }, error => {
        // assume it's a permission error
        joinGameButtonElement.removeAttribute('hidden');
      });      
    }
  } else { // User is signed out!
    if (unsubscribe) {
      boardElement.innerHTML = '';
      unsubscribe();
    }

    // Hide user's profile and sign-out button.
    userNameElement.setAttribute('hidden', 'true');
    userPicElement.setAttribute('hidden', 'true');
    signOutButtonElement.setAttribute('hidden', 'true');

    // Show sign-in button.
    signInButtonElement.removeAttribute('hidden');

    // Hide new game button.
    newGameButtonElement.setAttribute('hidden', 'true');

    // Hide join game button
    joinGameButtonElement.setAttribute('hidden', 'true');
  }
}

// Adds a size to Google Profile pics URLs.
function addSizeToGoogleProfilePic(url) {
  if (url.indexOf('googleusercontent.com') !== -1 && url.indexOf('?') === -1) {
    return url + '?sz=150';
  }
  return url;
}


const GAMES = 'games';

// Shortcuts to DOM Elements.
var bodyElement = document.getElementsByTagName('body').item(0);
var userPicElement = document.getElementById('user-pic');
var userNameElement = document.getElementById('user-name');
var signInButtonElement = document.getElementById('sign-in');
var signOutButtonElement = document.getElementById('sign-out');
var signInSnackbarElement = document.getElementById('must-signin-snackbar');
var newGameButtonElement = document.getElementById('new-game');
var inviteElement = document.getElementById('invite');
var inviteLinkElement = document.getElementById('invite-link');
var joinGameButtonElement = document.getElementById('join-game');
var boardElement = document.getElementById('board');

signOutButtonElement.addEventListener('click', signOut);
signInButtonElement.addEventListener('click', signIn);
newGameButtonElement.addEventListener('click', newGame);
joinGameButtonElement.addEventListener('click', joinGame);

// initialize Firebase
initFirebaseAuth();

var firestore = firebase.firestore();
var settings = {timestampsInSnapshots: true};

// Functions
var newGameFunc = firebase.functions().httpsCallable('newGame');
var joinGameFunc = firebase.functions().httpsCallable('joinGame');
var playMoveFunc = firebase.functions().httpsCallable('playMove');

firestore.settings(settings);

// For local testing.  (Does not because cannot connect to Cloud Firestore.)
// firebase.functions().useFunctionsEmulator('http://localhost:5001');

// Global variables (yuck)
// Callback to unsubscribe from a game.
var unsubscribe = null;
// Game object.
var gameState = null;