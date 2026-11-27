(function () {
    "use strict";

    var DISPLAY_DURATION_MS = 3500; // Time message stays visible before fade-out
    var FADE_DURATION_MS = 900;     // Matches CSS transition duration

    function exitToHome() {
        try {
            if (typeof tizen !== "undefined" && tizen.application) {
                tizen.application.launch(
                    "org.tizen.homescreen",
                    function () {
                        tizen.application.getCurrentApplication().exit();
                    },
                    function () {
                        // Fallback: cleanly exits to the TV home/previous screen
                        tizen.application.getCurrentApplication().exit();
                    }
                );
            }
        } catch (e) {
            if (typeof tizen !== "undefined" && tizen.application) {
                tizen.application.getCurrentApplication().exit();
            }
        }
    }

    window.onload = function () {
        var container = document.getElementById("welcome-container");

        // Smooth fade-in
        setTimeout(function () {
            container.classList.add("visible");
        }, 100);

        // Fade-out after display duration
        setTimeout(function () {
            container.classList.remove("visible");
            container.classList.add("fade-out");

            // Return to home screen once fade-out finishes
            setTimeout(exitToHome, FADE_DURATION_MS);
        }, DISPLAY_DURATION_MS);

        // Press Back/Return on the Samsung remote (keyCode 10009) to exit immediately
        document.addEventListener("keydown", function (event) {
            if (event.keyCode === 10009) {
                if (typeof tizen !== "undefined" && tizen.application) {
                    tizen.application.getCurrentApplication().exit();
                }
            }
        });
    };
})();