self.port.on("updatePopup", function(popupText) {
    $("#popupText").html(popupText);
});

$("#popup").click(function() {
    self.port.emit("popup-open-selfoss");
});