// -----------------------------------------------------------------
// TaskRouter JS code
// -----------------------------------------------------------------
//
let worker;                 // Worker object: worker.activityName
let taskSid = "";
let ReservationObject;
var trTokenValid = false;

// Workspace activity SIDs
var ActivitySid_Available = "";
var ActivitySid_Offline = "";
var ActivitySid_Unavailable = "";

var theConference = "";

let device;
let connection = null;

function setupDevice(token, applicationSid) {
    device = new Twilio.Device(token, {
        codecPreferences: ['opus', 'pcmu'],
        fakeLocalDTMF: true,
        enableRingingState: true,
        applicationSid: applicationSid
    });

    device.on('ready', function() {
        logger('Twilio.Device Ready!');
    });

    device.on('error', function(error) {
        logger('Twilio.Device Error: ' + error.message);
    });

    device.on('connect', function(conn) {
        logger('Successfully established call!');
        connection = conn;
    });

    device.on('disconnect', function(conn) {
        logger('Call ended.');
        connection = null;
    });
}

function acceptCall() {
    if (device) {
        device.connect({ callerId: ReservationObject.task.attributes.from })
            .then(function(conn) {
                logger("Agent connected to call via Voice SDK.");
                connection = conn;
            })
            .catch(function(error) {
                logger("Error connecting agent to call: " + error.message);
            });
    } else {
        logger("Voice SDK device not set up. Cannot connect agent to call.");
    }
}

function endCall() {
    if (connection) {
        connection.disconnect();
    }
}

// -----------------------------------------------------------------
// let worker = new Twilio.TaskRouter.Worker("<?= $workerToken ?>");
function registerTaskRouterCallbacks() {
    logger("registerTaskRouterCallbacks().");
    worker.on('ready', function (worker) {
        logger("Worker registered: " + worker.friendlyName + ".");
        if (worker.attributes.skills) {
            logger("Skills: " + worker.attributes.skills.join(', '));
        }
        if (worker.attributes.languages) {
            logger("Languages: " + worker.attributes.languages.join(', '));
        }
        logger("Current activity is: " + worker.activityName);
        if (worker.activityName === "Unavailable") {
            goOffline();
        }
        logger("---------");
        setTrButtons(worker.activityName);
        $("div.trStatus").html(worker.activityName);
        $('#btn-trtoken').prop('disabled', true);
    });
    worker.on('activity.update', function (worker) {
        logger("Worker activity updated to: " + worker.activityName);
        if (taskSid !== "") {
            logger("taskSid = " + taskSid);
        }
        setTrButtons(worker.activityName);
        $("div.trStatus").html(worker.activityName);
        if (taskSid !== "" && worker.activityName === "Offline") {
            // Insure the agent is not hanging in assignment status of wrapping.
            $.get("taskSetWrapToCompleted?taskSid=" + taskSid, function (theResponse) {
                logger("Task check: " + theResponse);
            })
                    .fail(function () {
                        logger("- Error running Task Reservation Fix for status: wrapping.");
                        logger("-- The response: " + theResponse);
                        return;
                    });
            taskSid = "";
        }
    });
    // -----------------------------------------------------------------
    worker.on('reservation.created', function (reservation) {
        // reservation.task.attributes can be passed when the task is created.
        logger("---------");
        logger("reservation.created: You are reserved to handle a call from: " + reservation.task.attributes.from);
        if (reservation.task.attributes.selected_language) {
            logger("Caller selected language: " + reservation.task.attributes.selected_language);
        }
        if (reservation.task.attributes.selected_product) {
            logger("Customer request, task.attributes.selected_product: " + reservation.task.attributes.selected_product);
        }
        logger("Reservation SID: " + reservation.sid);
        setTrButtons("Incoming Reservation");
        ReservationObject = reservation;
        taskSid = reservation.task.sid;
        logger("reservation.task.sid: " + taskSid);
    });
    worker.on('reservation.accepted', function (reservation) {
        logger("Reservation accepted, SID: " + reservation.sid);
        logger("---------");
        ReservationObject = reservation;
        setTrButtons('reservation.accepted');
        theConference = ReservationObject.task.attributes.conference.sid;
        logger("Conference SID: " + theConference);
        setButtonEndConference(false);
        worker.update("ActivitySid", ActivitySid_Unavailable, function (error, worker) {
            if (error) {
                logger("--- acceptReservation, goUnavailable, Error:");
                logger(error.code);
                logger(error.message);
                // Example error message: The conference instruction can only be issued on a task that was created using the <Enqueue> TwiML verb.
                $('#btn-online').prop('disabled', true);
                $('#btn-offline').prop('disabled', true);
                $('#btn-trtoken').prop('disabled', false);
                $("div.msgTokenPassword").html("Refresh TaskRouter token.");
            }
        });

    });
    worker.on('reservation.rejected', function (reservation) {
        taskSid = "";
        logger("Reservation rejected, SID: " + reservation.sid + " by worker.sid: " + worker.sid);
        setTrButtons("canceled");
    });
    worker.on('reservation.timeout', function (reservation) {
        taskSid = "";
        logger("Reservation timed out: " + reservation.sid);
        setTrButtons("Offline");
    });
    worker.on('reservation.canceled', function (reservation) {
        taskSid = "";
        logger("Reservation canceled: " + reservation.sid);
        setTrButtons("canceled");
    });
    // -----------------------------------------------------------------
}

// -----------------------------------------------------------------
function goAvailable() {
    logger("goAvailable(): update worker's activity to: Available.");
    worker.update("ActivitySid", ActivitySid_Available, function (error, worker) {
        if (error) {
            logger("--- goAvailable, Error:");
            logger(error.code);
            logger(error.message);
            $('#btn-online').prop('disabled', true);
            $('#btn-offline').prop('disabled', true);
            $('#btn-trtoken').prop('disabled', false);
            $("div.msgTokenPassword").html("Refresh TaskRouter token.");
        }
        ReservationObject.task.complete();
    });
}
function goOffline() {
    logger("goOffline(): update worker's activity to: Offline.");
    worker.update("ActivitySid", ActivitySid_Offline, function (error, worker) {
        if (error) {
            logger("--- goOffline, Error:");
            logger(error.code);
            logger(error.message);
        }
    });
}
function trHangup() {
    logger("trHangup(), set ReservationObject.task.complete().");
    ReservationObject.task.complete();
    worker.update("ActivitySid", ActivitySid_Offline, function (error, worker) {
        logger("Worker ended the call: " + worker.friendlyName);
        hangup();   // Call client hangup to take care of: Twilio.Device.disconnectAll();
        if (error) {
            logger("--- trHangup, Error:");
            logger(error.code);
            logger(error.message);
        } else {
            logger(worker.activityName);
        }
        logger("---------");
    });
    logger("---------");
}
// -----------------------------------------------------------------
function rejectReservation() {
    logger("rejectReservation(): reject the reservation.");
    ReservationObject.reject();
}
function acceptReservation() {
    logger("acceptReservation(): start a conference call, and connect caller and agent.");
    var options = {
        "PostWorkActivitySid": ActivitySid_Offline,
        "Timeout": 5
    };
    logger("Conference call attribute, Timeout: " + options.Timeout);
    logger("TaskRouter post activity SID: " + options.PostWorkActivitySid);

    ReservationObject.conference(null, null, null, null, null, options);
    logger("Conference initiated via TaskRouter.");

    acceptCall();
    setTrButtons("In a Call");
}

// -----------------------------------------------------------------------------
// Get TaskRouter activities.
function getTrActivies() {
    logger("Refresh TaskRouter workspace activities.");
    $.get("getTrActivites", function (theActivites) {
        logger("+ theActivites = " + theActivites);
        arrayValues = theActivites.split(":");
        $("div.trWorkSpace").html(arrayValues[0]);  // Display the Workspace friendly name
        var i;
        for (i = 1; i < arrayValues.length; i++) {
            // logger("+ i value = " + i + ":" + arrayValues[i]);
            if (arrayValues[i] === "Available") {
                ActivitySid_Available = arrayValues[i - 1];
                logger("+ ActivitySid_Available = " + ActivitySid_Available);
            }
            if (arrayValues[i] === "Offline") {
                ActivitySid_Offline = arrayValues[i - 1];
                logger("+ ActivitySid_Offline = " + ActivitySid_Offline);
            }
            if (arrayValues[i] === "Unavailable") {
                ActivitySid_Unavailable = arrayValues[i - 1];
                logger("+ ActivitySid_Unavailable = " + ActivitySid_Unavailable);
            }
        }
    })
            .fail(function () {
                logger("- Error refreshing the TaskRouter workspace activities.");
                return;
            });
}
// -----------------------------------------------------------------
function setWorkSpace(workerActivity) {
    $("div.trWorkSpace").html(arrayValues[0]);
}

// -----------------------------------------------------------------------------
// Get a TaskRouter Worker token.
function trToken() {
    if (trTokenValid) {
        $("div.msgTokenPassword").html("TaskRouter token already valid.");
        return;
    }
    clearMessages();
    clientId = $("#clientid").val();
    if (clientId === "") {
        $("div.msgClientid").html("<b>Required</b>");
        logger("- Required: Client id.");
        return;
    }
    tokenPassword = $("#tokenPassword").val();
    if (tokenPassword === "") {
        $("div.msgTokenPassword").html("<b>Required</b>");
        logger("- Required: Token password.");
        return;
    }
    logger("Refresh the TaskRouter token using client id: " + clientId);
    $("div.trMessages").html("Refreshing token, please wait.");
    $.get("generateToken?clientid=" + clientId + "&tokenPassword=" + tokenPassword, function (tokens) {
        $("div.trMessages").html("TaskRouter and Voice tokens received.");
        logger("TaskRouter Worker token refreshed, stringlength :" + tokens.workerToken.length + ":");
        logger("Voice token refreshed, stringlength :" + tokens.voiceToken.length + ":");
        worker = new Twilio.TaskRouter.Worker(tokens.workerToken);
        setupDevice(tokens.voiceToken, tokens.applicationSid);
        registerTaskRouterCallbacks();
        $("div.msgClientid").html("TaskRouter Token id: " + clientId);
        trTokenValid = true;
        logger("TaskRouter and Voice tokens refreshed.");
        tokenClientId = clientId;
        $("div.msgTokenPassword").html("TaskRouter and Voice Tokens refreshed");
    })
    .fail(function () {
        logger("- Error refreshing the tokens.");
        $("div.trMessages").html("Identity and password invalid.");
        return;
    });
}


// -----------------------------------------------------------------------------
// Conference call functions

function setButtonEndConference(value) {
    $('#btn-endconf').prop('disabled', value);
    setTrButtons("Available");
}
function endConference() {
    endCall();
    if (theConference === "") {
        $("div.trMessages").html("Conference call not started.");
        logger("- theConference not set.");
        return;
    }
    $("div.callMessages").html("Please wait, ending conference.");
    logger("End the conference: " + theConference);
    setButtonEndConference(true);
    $.get("conferenceCompleted?conferenceSid=" + theConference, function (theResponse) {
        logger("Response: " + theResponse);
        theConference = "";
    }).fail(function () {
        logger("- Error ending conference.");
        return;
    });
}


// -----------------------------------------------------------------
function setTrButtons(workerActivity) {
    // logger("setTrButtons, Worker activity: " + workerActivity);
    $("div.trMessages").html("Current TaskRouter status: " + workerActivity);
    switch (workerActivity) {
        case "init":
            $('#btn-online').prop('disabled', true);
            $('#btn-offline').prop('disabled', true);
            $('#btn-acceptTR').prop('disabled', true);
            $('#btn-rejectTR').prop('disabled', true);
            $('#btn-trHangup').prop('disabled', true);
            getTrActivies();
            break;
        case "Available":
            $('#btn-online').prop('disabled', true);
            $('#btn-offline').prop('disabled', false);
            $('#btn-acceptTR').prop('disabled', true);
            $('#btn-rejectTR').prop('disabled', true);
            $('#btn-trHangup').prop('disabled', true);
            break;
        case "Offline":
            $('#btn-online').prop('disabled', false);
            $('#btn-offline').prop('disabled', true);
            $('#btn-acceptTR').prop('disabled', true);
            $('#btn-rejectTR').prop('disabled', true);
            $('#btn-trHangup').prop('disabled', true);
            break;
        case "Incoming Reservation":
            $('#btn-online').prop('disabled', true);
            $('#btn-offline').prop('disabled', true);
            $('#btn-acceptTR').prop('disabled', false);
            $('#btn-rejectTR').prop('disabled', false);
            $('#btn-trHangup').prop('disabled', true);
            break;
        case 'reservation.accepted':
            $('#btn-online').prop('disabled', true);
            $('#btn-offline').prop('disabled', true);
            $('#btn-acceptTR').prop('disabled', true);
            $('#btn-rejectTR').prop('disabled', true);
            $('#btn-trHangup').prop('disabled', false);
            setButtonEndConference(false);
            break;
        case "In a Call":
            $('#btn-online').prop('disabled', true);
            $('#btn-offline').prop('disabled', true);
            $('#btn-acceptTR').prop('disabled', true);
            $('#btn-rejectTR').prop('disabled', true);
            $('#btn-trHangup').prop('disabled', false);
            break;
        case "canceled":
            $('#btn-online').prop('disabled', true);
            $('#btn-offline').prop('disabled', false);
            $('#btn-acceptTR').prop('disabled', true);
            $('#btn-rejectTR').prop('disabled', true);
            $('#btn-trHangup').prop('disabled', true);
            break;
    }
}

// -----------------------------------------------------------------
// eof