let audioEnabled = true;

const STORAGE_KEY = "medicalCarePatient";


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
   LOGGED-IN PATIENT (stored client-side after
   the server confirms username/password)
========================================= */

function getLoggedInPatient() {

    try {

        const raw = localStorage.getItem(STORAGE_KEY);

        return raw ? JSON.parse(raw) : null;

    } catch (error) {

        return null;
    }
}

function setLoggedInPatient(patient) {

    localStorage.setItem(STORAGE_KEY, JSON.stringify(patient));
}

function clearLoggedInPatient() {

    localStorage.removeItem(STORAGE_KEY);
}

function logoutUser() {

    clearLoggedInPatient();
}

/* Pages that show patient-only data redirect back to login
   if nobody is signed in. */
function requireLogin() {

    const patient = getLoggedInPatient();

    if (!patient) {

        window.location.href = "login.html";
        return null;
    }

    return patient;
}


/* =========================================
   PATIENT LOGIN
========================================= */

async function loginUser() {

    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");

    const username = usernameInput ? usernameInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";

    if (username === "" || password === "") {

        alert("Please enter your username and password.");

        speak(
            "Please enter your username and password before logging in."
        );

        return;
    }

    try {

        const response = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();

        if (!response.ok) {

            alert(data.error || "Invalid username or password.");
            speak(data.error || "Invalid username or password.");
            return;
        }

        setLoggedInPatient(data.patient);

        speak(
            "Welcome, " + data.patient.fullName + ". You are being taken to your patient dashboard."
        );

        setTimeout(function () {

            window.location.href = "patient-dashboard.html";

        }, 1200);

    } catch (error) {

        alert("Could not reach the MedicalCare server. Please make sure it is running.");
        speak("Could not reach the MedicalCare server.");
    }
}


/* =========================================
   PATIENT REGISTRATION (new patient database
   account, used from register.html)
========================================= */

async function registerPatient() {

    const fields = {
        username: document.getElementById("regUsername"),
        password: document.getElementById("regPassword"),
        fullName: document.getElementById("regFullName"),
        dateOfBirth: document.getElementById("regDateOfBirth"),
        phone: document.getElementById("regPhone"),
        email: document.getElementById("regEmail"),
        preferredContact: document.getElementById("regPreferredContact"),
    };

    const username = fields.username ? fields.username.value.trim() : "";
    const password = fields.password ? fields.password.value : "";
    const fullName = fields.fullName ? fields.fullName.value.trim() : "";

    if (username === "" || password === "" || fullName === "") {

        alert("Please fill in your name, username, and password.");
        speak("Please fill in your name, username, and password before creating your account.");
        return;
    }

    try {

        const response = await fetch("/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username,
                password,
                fullName,
                dateOfBirth: fields.dateOfBirth ? fields.dateOfBirth.value : "",
                phone: fields.phone ? fields.phone.value.trim() : "",
                email: fields.email ? fields.email.value.trim() : "",
                preferredContact: fields.preferredContact ? fields.preferredContact.value : "Email",
            }),
        });

        const data = await response.json();

        if (!response.ok) {

            alert(data.error || "Could not create your account.");
            speak(data.error || "Could not create your account.");
            return;
        }

        setLoggedInPatient(data.patient);

        alert("Account created! You are being taken to your patient dashboard.");
        speak("Account created. You are being taken to your patient dashboard.");

        setTimeout(function () {

            window.location.href = "patient-dashboard.html";

        }, 1200);

    } catch (error) {

        alert("Could not reach the MedicalCare server. Please make sure it is running.");
        speak("Could not reach the MedicalCare server.");
    }
}


/* =========================================
   LOAD PATIENT NAME (dashboard greeting)
========================================= */

function loadPatientName() {

    const patient = getLoggedInPatient();

    const nameElement =
        document.getElementById("patientName");

    if (patient && nameElement) {

        nameElement.textContent = patient.fullName;
    }
}


/* =========================================
   PATIENT INFORMATION PAGE
========================================= */

async function loadPatientInformation() {

    // Only run on pages that actually have patient-information fields,
    // so this shared script doesn't redirect visitors away from
    // index.html, login.html, etc.
    if (!document.getElementById("infoFullName")) {
        return;
    }

    const patient = requireLogin();

    if (!patient) {
        return;
    }

    try {

        const response = await fetch(`/api/patients/${patient.id}`);
        const data = await response.json();

        if (!response.ok) {
            return;
        }

        const info = data.patient;

        setText("infoFullName", info.fullName);
        setText("infoDateOfBirth", info.dateOfBirth || "Not provided");
        setText("infoPhone", info.phone || "Not provided");
        setText("infoEmail", info.email || "Not provided");
        setText("infoPreferredContact", info.preferredContact || "Not provided");
        setText("infoEmergencyName", info.emergencyName || "Not provided");
        setText("infoEmergencyRelationship", info.emergencyRelationship || "Not provided");
        setText("infoEmergencyPhone", info.emergencyPhone || "Not provided");
        setText("infoPrimaryCareProvider", info.primaryCareProvider || "Not provided");
        setText("infoPreferredPharmacy", info.preferredPharmacy || "Not provided");
        setText("infoInsuranceProvider", info.insuranceProvider || "Not provided");

        // Also fill the edit form, if this page has one.
        setValue("editDateOfBirth", info.dateOfBirth);
        setValue("editPhone", info.phone);
        setValue("editEmail", info.email);
        setValue("editPreferredContact", info.preferredContact);
        setValue("editEmergencyName", info.emergencyName);
        setValue("editEmergencyRelationship", info.emergencyRelationship);
        setValue("editEmergencyPhone", info.emergencyPhone);
        setValue("editPrimaryCareProvider", info.primaryCareProvider);
        setValue("editPreferredPharmacy", info.preferredPharmacy);
        setValue("editInsuranceProvider", info.insuranceProvider);

    } catch (error) {

        speak("Could not load your patient information from the server.");
    }
}

function setText(elementId, text) {

    const element = document.getElementById(elementId);

    if (element) {
        element.textContent = text;
    }
}

function setValue(elementId, value) {

    const element = document.getElementById(elementId);

    if (element) {
        element.value = value || "";
    }
}

async function savePatientInformation() {

    const patient = requireLogin();

    if (!patient) {
        return;
    }

    const payload = {
        phone: getValue("editPhone"),
        email: getValue("editEmail"),
        dateOfBirth: getValue("editDateOfBirth"),
        preferredContact: getValue("editPreferredContact"),
        emergencyName: getValue("editEmergencyName"),
        emergencyRelationship: getValue("editEmergencyRelationship"),
        emergencyPhone: getValue("editEmergencyPhone"),
        primaryCareProvider: getValue("editPrimaryCareProvider"),
        preferredPharmacy: getValue("editPreferredPharmacy"),
        insuranceProvider: getValue("editInsuranceProvider"),
    };

    try {

        const response = await fetch(`/api/patients/${patient.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {

            alert("Could not save your patient information.");
            return;
        }

        alert("Your patient information has been updated.");
        speak("Your patient information has been updated.");

        loadPatientInformation();

    } catch (error) {

        alert("Could not reach the MedicalCare server. Please make sure it is running.");
    }
}

function getValue(elementId) {

    const element = document.getElementById(elementId);

    return element ? element.value.trim() : "";
}


/* =========================================
   SCHEDULE APPOINTMENT
========================================= */

async function scheduleAppointment() {

    const patient = requireLogin();

    if (!patient) {
        return;
    }

    const provider =
        document.getElementById("provider")?.value || "";

    const appointmentType =
        document.getElementById("appointmentType")?.value || "";

    const date =
        document.getElementById("appointmentDate")?.value || "";

    const time =
        document.getElementById("appointmentTime")?.value || "";

    const reason =
        document.getElementById("reason")?.value.trim() || "";


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

    try {

        const response = await fetch("/api/appointments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                patientId: patient.id,
                provider,
                appointmentType,
                date,
                time,
                reason,
            }),
        });

        if (!response.ok) {

            alert("Could not schedule your appointment. Please try again.");
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

    } catch (error) {

        alert("Could not reach the MedicalCare server. Please make sure it is running.");
    }
}


/* =========================================
   APPOINTMENTS PAGE (list + cancel)
========================================= */

async function loadAppointments() {

    const upcomingContainer = document.getElementById("upcomingAppointments");
    const previousContainer = document.getElementById("previousAppointments");

    if (!upcomingContainer && !previousContainer) {
        return;
    }

    const patient = requireLogin();

    if (!patient) {
        return;
    }

    try {

        const response = await fetch(`/api/appointments?patientId=${patient.id}`);
        const data = await response.json();

        if (!response.ok) {
            return;
        }

        const upcoming = data.appointments.filter(a => a.status === "upcoming");
        const previous = data.appointments.filter(a => a.status !== "upcoming");

        if (upcomingContainer) {
            renderAppointments(upcomingContainer, upcoming, true);
        }

        if (previousContainer) {
            renderAppointments(previousContainer, previous, false);
        }

    } catch (error) {

        speak("Could not load your appointments from the server.");
    }
}

function renderAppointments(container, appointments, showCancel) {

    container.innerHTML = "";

    if (appointments.length === 0) {

        const empty = document.createElement("p");
        empty.textContent = showCancel
            ? "You have no upcoming appointments."
            : "You have no previous appointments.";
        container.appendChild(empty);
        return;
    }

    appointments.forEach(function (appt, index) {

        if (index > 0) {
            container.appendChild(document.createElement("hr"));
        }

        const wrapper = document.createElement("div");

        wrapper.innerHTML = `
            <p><strong>Provider:</strong> ${appt.providerLabel}</p>
            <p><strong>Date:</strong> ${appt.date}</p>
            <p><strong>Time:</strong> ${appt.time}</p>
            <p><strong>Appointment Type:</strong> ${appt.appointmentTypeLabel}</p>
            <p><strong>Status:</strong> ${appt.status}</p>
        `;

        container.appendChild(wrapper);

        if (showCancel && appt.status === "upcoming") {

            const cancelButton = document.createElement("button");
            cancelButton.type = "button";
            cancelButton.textContent = "Cancel Appointment";
            cancelButton.setAttribute("aria-label", "Cancel appointment with " + appt.providerLabel);
            cancelButton.addEventListener("click", function () {
                cancelAppointment(appt.id);
            });

            wrapper.appendChild(cancelButton);
        }
    });
}

async function cancelAppointment(appointmentId) {

    try {

        const response = await fetch(`/api/appointments/${appointmentId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "cancelled" }),
        });

        if (!response.ok) {

            alert("Could not cancel this appointment.");
            return;
        }

        alert("Your appointment cancellation request has been submitted.");
        speak("Your appointment cancellation request has been submitted.");

        loadAppointments();

    } catch (error) {

        alert("Could not reach the MedicalCare server. Please make sure it is running.");
    }
}


/* =========================================
   SEND MESSAGE / MESSAGES PAGE
========================================= */

async function sendMessage() {

    const patient = requireLogin();

    if (!patient) {
        return;
    }

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

    try {

        const response = await fetch("/api/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                patientId: patient.id,
                recipient: provider,
                body: message,
            }),
        });

        if (!response.ok) {

            alert("Could not send your message.");
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

        loadMessages();

    } catch (error) {

        alert("Could not reach the MedicalCare server. Please make sure it is running.");
    }
}

async function loadMessages() {

    const container = document.getElementById("messageList");

    if (!container) {
        return;
    }

    const patient = requireLogin();

    if (!patient) {
        return;
    }

    try {

        const response = await fetch(`/api/messages?patientId=${patient.id}`);
        const data = await response.json();

        if (!response.ok) {
            return;
        }

        container.innerHTML = "";

        if (data.messages.length === 0) {

            const empty = document.createElement("p");
            empty.textContent = "You have no messages yet.";
            container.appendChild(empty);
            return;
        }

        data.messages.forEach(function (msg, index) {

            if (index > 0) {
                container.appendChild(document.createElement("hr"));
            }

            const item = document.createElement("div");
            item.className = "message";

            const isFromPatient = msg.sender === patient.username;
            const heading = isFromPatient ? "You, to " + msg.recipient : msg.sender;

            item.innerHTML = `
                <h3>${heading}</h3>
                <p>${msg.body}</p>
                <small>${msg.createdAt}</small>
            `;

            container.appendChild(item);
        });

    } catch (error) {

        speak("Could not load your messages from the server.");
    }
}


/* =========================================
   STAFF: PATIENT SEARCH
========================================= */

async function searchPatient() {

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

    const resultsContainer = document.getElementById("patientSearchResults");

    try {

        const response = await fetch(`/api/patients?search=${encodeURIComponent(patientName)}`);
        const data = await response.json();

        if (!response.ok) {

            alert("The patient search could not be completed.");
            return;
        }

        alert(
            "Patient search completed for " +
            patientName +
            ". " + data.patients.length + " matching record(s) found."
        );

        speak(
            "Patient search completed for " +
            patientName +
            ". " + data.patients.length + " matching patient record" +
            (data.patients.length === 1 ? "" : "s") + " found."
        );

        if (resultsContainer) {

            resultsContainer.innerHTML = "";

            data.patients.forEach(function (p, index) {

                if (index > 0) {
                    resultsContainer.appendChild(document.createElement("hr"));
                }

                const item = document.createElement("p");
                item.innerHTML = `<strong>${p.fullName}</strong> &mdash; DOB: ${p.dateOfBirth || "N/A"}, Phone: ${p.phone || "N/A"}, Email: ${p.email || "N/A"}`;
                resultsContainer.appendChild(item);
            });

            if (data.patients.length === 0) {

                const empty = document.createElement("p");
                empty.textContent = "No matching patients found.";
                resultsContainer.appendChild(empty);
            }
        }

    } catch (error) {

        alert("Could not reach the MedicalCare server. Please make sure it is running.");
    }
}


/* =========================================
   STAFF: TODAY'S APPOINTMENTS
========================================= */

async function loadTodayAppointments() {

    const container = document.getElementById("todayAppointments");

    if (!container) {
        return;
    }

    try {

        const response = await fetch("/api/appointments?date=today");
        const data = await response.json();

        if (!response.ok) {
            return;
        }

        container.innerHTML = "";

        if (data.appointments.length === 0) {

            const empty = document.createElement("p");
            empty.textContent = "No appointments are scheduled for today.";
            container.appendChild(empty);
            return;
        }

        data.appointments.forEach(function (appt) {

            const item = document.createElement("p");
            item.innerHTML = `<strong>${appt.time}</strong> - ${appt.patientName} - ${appt.appointmentTypeLabel} (${appt.providerLabel})`;
            container.appendChild(item);
        });

    } catch (error) {

        // Fail quietly on the staff dashboard - the rest of the page still works.
    }
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

    // Page-specific data loading: each function checks for the
    // elements it needs and quietly does nothing if they're not
    // on the current page, so this file can be shared by every page.
    loadPatientInformation();
    loadAppointments();
    loadMessages();
    loadTodayAppointments();

});
