let audioEnabled = true;


/* =========================================
   TEXT TO SPEECH
========================================= */

function speak(text) {

    if (!audioEnabled) {
        return;
    }

    if (!("speechSynthesis" in window)) {
        alert("Audio assistance is not supported by this browser.");
        return;
    }

    window.speechSynthesis.cancel();

    const message = new SpeechSynthesisUtterance(text);

    message.rate = 0.85;
    message.pitch = 1;
    message.volume = 1;

    window.speechSynthesis.speak(message);
}


/* =========================================
   READ SPECIFIC TEXT
========================================= */

function speakText(text) {
    speak(text);
}


/* =========================================
   STOP AUDIO
========================================= */

function stopSpeaking() {

    if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }
}


/* =========================================
   READ PAGE
========================================= */

function readPage() {

    const main = document.querySelector("main");

    if (!main) {
        speak("There is no page information available.");
        return;
    }

    let text = main.innerText.trim();

    if (!text) {
        speak("There is no page information available.");
        return;
    }

    speak(text);
}


/* =========================================
   AUDIO TOGGLE
========================================= */

function toggleAudio() {

    const button = document.getElementById("audioToggle");

    if (audioEnabled) {

        audioEnabled = false;

        if (button) {
            button.textContent = "🔇 Audio Assistance: OFF";
        }

        stopSpeaking();

    } else {

        audioEnabled = true;

        if (button) {
            button.textContent = "🔊 Audio Assistance: ON";
        }

        speak(
            "Audio assistance is now on. You can use the audio buttons on this page to hear information aloud."
        );
    }
}


/* =========================================
   PATIENT LOGIN
========================================= */

function loginUser() {

    const usernameInput = document.getElementById("username");

    const username = usernameInput
        ? usernameInput.value.trim()
        : "";

    if (username === "") {

        alert("Please enter your name or username.");

        speak(
            "Please enter your name or username before logging in."
        );

        return;
    }

    localStorage.setItem("patientName", username);

    speak(
        "Welcome, " + username + ". You are being taken to your patient dashboard."
    );

    setTimeout(function () {

        window.location.href = "patient-dashboard.html";

    }, 1200);
}


/* =========================================
   LOAD PATIENT NAME
========================================= */

function loadPatientName() {

    const patientName =
        localStorage.getItem("patientName");

    const nameElement =
        document.getElementById("patientName");

    if (patientName && nameElement) {

        nameElement.textContent = patientName;
    }
}


/* =========================================
   SCHEDULE APPOINTMENT
========================================= */

function scheduleAppointment() {

    const provider =
        document.getElementById("provider")?.value || "";

    const appointmentType =
        document.getElementById("appointmentType")?.value || "";

    const date =
        document.getElementById("appointmentDate")?.value || "";

    const time =
        document.getElementById("appointmentTime")?.value || "";


    if (
        provider === "" ||
        appointmentType === "" ||
        date === "" ||
        time === ""
    ) {

        alert(
            "Please complete the provider, appointment type, date, and time before scheduling."
        );

        speak(
            "Please complete the healthcare provider, appointment type, preferred date, and preferred time before scheduling your appointment."
        );

        return;
    }


    alert(
        "Your appointment request has been submitted successfully."
    );

    speak(
        "Your appointment request has been submitted successfully."
    );


    setTimeout(function () {

        window.location.href = "appointments.html";

    }, 1500);
}


/* =========================================
   SEND MESSAGE
========================================= */

function sendMessage() {

    const provider =
        document.getElementById("messageProvider")?.value || "";

    const message =
        document.getElementById("messageText")?.value.trim() || "";


    if (provider === "") {

        alert("Please select a healthcare provider.");

        speak(
            "Please select a healthcare provider before sending your message."
        );

        return;
    }


    if (message === "") {

        alert("Please enter a message before sending.");

        speak(
            "Please enter a message before sending."
        );

        return;
    }


    alert(
        "Your message has been sent successfully."
    );

    speak(
        "Your message has been sent successfully to your healthcare provider."
    );


    document.getElementById("messageProvider").value = "";

    document.getElementById("messageText").value = "";
}


/* =========================================
   PATIENT SEARCH
========================================= */

function searchPatient() {

    const searchElement =
        document.getElementById("patientSearch");

    const patientName =
        searchElement
            ? searchElement.value.trim()
            : "";


    if (patientName === "") {

        alert("Please enter a patient name.");

        speak(
            "Please enter a patient name."
        );

        return;
    }


    alert(
        "Patient search completed for " +
        patientName +
        "."
    );

    speak(
        "Patient search completed for " +
        patientName +
        ". Matching patient records would appear here."
    );
}


/* =========================================
   PAGE SETUP
========================================= */

document.addEventListener("DOMContentLoaded", function () {

    loadPatientName();


    /*
       IMPORTANT:

       We do NOT automatically make every button
       speak its visible label.

       Buttons with data-audio-text will speak
       their full description when clicked.
    */

    const buttons =
        document.querySelectorAll("button[data-audio-text]");


    buttons.forEach(function (button) {

        button.addEventListener("click", function (event) {

            const audioText =
                button.getAttribute("data-audio-text");

            if (audioText) {

                /*
                   Prevent the automatic browser action
                   from causing another audio message.
                */

                speak(audioText);
            }

        });

    });

});