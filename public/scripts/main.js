function signIn() {
  var provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider);
}

function signOut() {
  firebase.auth().signOut();
}

function newGame() {
    newGameFunc({}).then(function(result) {
        console.log('gameId: ', result.data.gameId);
        subscribeGame(result.data.gameId);
    });
}

function joinGame() {
    var gameId = window.location.hash.substring(1);
    joinGameFunc({'gameId': gameId}).then(function(result) {
        console.log('joined gameId: ', result.data.gameId);
        subscribeGame(result.data.gameId);
    })
}

function subscribeGame(gameId) {
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
    unsubscribe = firebase.firestore().collection(GAMES).doc(gameId)
    .onSnapshot((doc) => {
        var rendering = '';
        var board = doc.data().board;
        for (var r = 0; r < board.rows.length; r++) {
            var row = board.rows[r];
            for (var c = 0; c < row.cols.length; c++) {
                var col = row.cols[c];
                rendering += col;
            }
            rendering += '\n';
        }
        boardElement.innerText = rendering;
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

    // Show join game button
    if (window.location.hash) {
        joinGameButtonElement.removeAttribute('hidden');
    }
  } else { // User is signed out!
    // Hide user's profile and sign-out button.
    userNameElement.setAttribute('hidden', 'true');
    userPicElement.setAttribute('hidden', 'true');
    signOutButtonElement.setAttribute('hidden', 'true');

    // Show sign-in button.
    signInButtonElement.removeAttribute('hidden');

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
var userPicElement = document.getElementById('user-pic');
var userNameElement = document.getElementById('user-name');
var signInButtonElement = document.getElementById('sign-in');
var signOutButtonElement = document.getElementById('sign-out');
var signInSnackbarElement = document.getElementById('must-signin-snackbar');
var newGameButtonElement = document.getElementById('new-game');
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

firestore.settings(settings);

// For local testing.  (Does not because cannot connect to Cloud Firestore.)
// firebase.functions().useFunctionsEmulator('http://localhost:5001');

// Global variables (yuck)
var unsubscribe = null;