self.port.on("updatePopup", function(popupText) {
    console.log("123");
    $("#popupText").html(popupText);
});

$("#popup").click(function() {
    self.port.emit("popup-open-selfoss");
});