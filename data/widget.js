self.port.on("updateIcon", function(iconImage, showBadge, badgeText, fontSize, fontColor, bgColor, opacity)
{
    document.getElementById("icon").src = iconImage;

    var badgeElement = document.getElementById("badgeText");
    badgeElement.textContent = badgeText;
    badgeElement.hidden = !(showBadge);

    badgeElement.style.fontSize = fontSize;
    badgeElement.style.color = fontColor;
    badgeElement.style.backgroundColor = bgColor;
    badgeElement.style.opacity = opacity/100;
});

this.addEventListener('click', function(event) {
    if(event.button == 0 && event.shiftKey == false)
        self.port.emit('left-click');

    if(event.button == 2 || (event.button == 0 && event.shiftKey == true))
        self.port.emit('right-click');
        event.preventDefault();
}, true);
