self.port.on("updateWidget", function(widgetIcon, showBadge, badgeText, fontSize, fontColor, bgColor, opacity) {
    document.getElementById("widgetIcon").src = widgetIcon;

    var badgeElement = document.getElementById("badgeText");
    badgeElement.textContent = badgeText;
    badgeElement.hidden = !(showBadge);

    badgeElement.style.fontSize = fontSize;
    badgeElement.style.color = fontColor;
    badgeElement.style.backgroundColor = bgColor;
    badgeElement.style.opacity = opacity/100;
});

this.addEventListener('click', function(event) {
    if(event.button == 0 && event.shiftKey == false && event.ctrlKey == false)
        self.port.emit('widget-left-click');

    if(event.button == 1 || (event.button == 0 && event.shiftKey == true))
        self.port.emit('widget-middle-click');

    if(event.button == 2 || (event.button == 0 && event.ctrlKey == true))
        self.port.emit('widget-right-click');

    event.preventDefault();
}, true);