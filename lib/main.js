var data = require("sdk/self").data;
var settings = require("sdk/simple-prefs").prefs;
var widgets = require("sdk/widget");
var request = require("sdk/request").Request;
var timers = require("sdk/timers");
var tabs = require("sdk/tabs");

var timer;

var curBadgeText;
var loggedIn = 2; // 2 - pending, 1 - logged in, 0 - login failed

require("sdk/simple-prefs").on("showBadge", updateIconSettings);
require("sdk/simple-prefs").on("fontSize", updateIconSettings);
require("sdk/simple-prefs").on("fontColor", updateIconSettings);
require("sdk/simple-prefs").on("bgColor", updateIconSettings);
require("sdk/simple-prefs").on("badgeOpacity", updateIconSettings);

require("sdk/simple-prefs").on("tryUpdate", doLogin);

require("sdk/simple-prefs").on("interval", updateInterval);

var widget = widgets.Widget({
    id: "selfoss-notify",
    label: "selfoss",
    contentURL: data.url("icon.html"),
    contentScriptFile: data.url("widget.js"),
    onAttach: function init() {
        console.log("INIT");
        updateInterval();
    }
});

widget.port.on("left-click", function(){
    if ((settings.url != null) && (settings.url != "")) {
        tabs.open(settings.url);
    }
});

widget.port.on("right-click", function(){
    doLogin();
});

function doLogin() {
    updateIcon("...", "Updating");

    var [proto, host]=stripTrailingSlash(settings.url).split("://");
    if (proto && host) {
        var cleanUrl = proto+'://'+host;
        request({ // check if already logged in
            url: cleanUrl+'/api/login',
            onComplete: function (response) {
                if (response.json && response.json.success) {
                    console.log("doLogin: already logged in");
                    checkUnread(cleanUrl);
                } else {
                    if (response.headers["WWW-Authenticate"]) {
                        var realm = response.headers["WWW-Authenticate"].match(/realm="(.+?)"/)[1]; // extract realm
                        console.log("doLogin: need http auth for "+cleanUrl+" realm "+realm);
                        require("sdk/passwords").search({ // get credentials for http auth
                            url: cleanUrl, realm: realm,
                            onComplete: function onComplete(credentials) {
                                if (credentials.length > 0) { // if credentials found
                                    request({ // check login with http auth
                                        url: proto+'://'+credentials[0].username+':'+credentials[0].password+'@'+host+'/api/login',
                                        onComplete: function (response) {
                                            if (!response.headers["WWW-Authenticate"]) {
                                                console.log("doLogin: http auth success");
                                                if (response.json && response.json.success) {
                                                    checkUnread(cleanUrl);
                                                } else {
                                                    doSiteLogin(cleanUrl);
                                                }
                                            } else {
                                                console.log("doLogin: http auth failed");
                                                updateIcon(-1, "HTTP auth failed, check your credentials in Firefox Password Manager");
                                            }
                                        }
                                    }).get();
                                } else {
                                    console.log("doLogin: http auth credentials not found");
                                    updateIcon(-1, "HTTP auth credentials not found, check Firefox Password Manager");
                                }
                            }
                        });
                    } else {
                        doSiteLogin(cleanUrl);
                    }
                }
            }
        }).get();
    } else {
        console.log("doLogin: invalid url");
        updateIcon(-1, "Invalid URL, check your settings");
    }
}

function doSiteLogin(cleanUrl) {
    require("sdk/passwords").search({ // get credentials for site auth
        url: cleanUrl, usernameField: 'username', passwordField: 'password', realm: null,
        onComplete: function onComplete(credentials) {
            if (credentials.length > 0) { // if credentials found
                request({ // check login with http auth
                    url: cleanUrl+'/api/login',
                    content: {username: credentials[0].username, password: credentials[0].password},
                    onComplete: function (response) {
                        if (response.json && response.json.success) {
                            console.log("doSiteLogin: logged in");
                            checkUnread(cleanUrl);
                        } else {
                            console.log("doSiteLogin: auth failed");
                            updateIcon(-1, "Site auth failed, check your credentials in Firefox Password Manager");
                        }
                    }
                }).get();
            } else {
                console.log("doLogin: site credentials not found");
                updateIcon(-1, "Site credentials not found, check Firefox Password Manager");
            }
        }
    });
}

function checkUnread(url) {
    console.log("checkUnread: start");
    request({
        url: url+'/api/items',
        onComplete: function (response) {
            if (response.json != null) {
                var count = 0;
                for (var i = 0; i < response.json.length; i++) {
                    if (response.json[i].unread == 1) {
                        count++;
                    }
                }
                console.log("checkUnread: " + count + " unread items");
                updateIcon(count, count + " unread items");
            } else {
                console.log("checkUnread: empty response");
                updateIcon(0, "No items");
            }
       }
    }).get();
}

function updateIcon(badgeText, tooltip) {
    if (settings.fontSize < 6) { settings.fontSize = 6; }
    if (settings.fontSize > 11) { settings.fontSize = 11; }
    if (settings.badgeOpacity < 0) { settings.badgeOpacity = 0; }
    if (settings.badgeOpacity > 100) { settings.badgeOpacity = 100; }

    var iconImage, showBadge;
    switch(badgeText) {
        case 0:
            iconImage = "logo_inactive.png";
            showBadge = false;
            break;
        case -1:
            iconImage = "logo_error.png";
            showBadge = false;
            break;
        default:
            iconImage = "logo.png";
            showBadge = settings.showBadge;
    }
    if (widget) {
        console.log("updateIcon");
        if (tooltip != null) {
            widget.tooltip = tooltip;
        }
        widget.port.emit("updateIcon", iconImage, showBadge, badgeText, settings.fontSize, settings.fontColor, settings.bgColor, settings.badgeOpacity);
    }
    curBadgeText = badgeText;
}

function updateIconSettings() {
    updateIcon(curBadgeText);
}

function updateInterval() {
    if (settings.interval < 1) {
        settings.interval = 1;
    }
    if (timer != null) {
        timers.clearInterval(timer);
        console.log("updateInterval: clear interval");
    }
    timer = timers.setInterval(doLogin, settings.interval * 1000 * 60);
    console.log("updateInterval: setting interval " + settings.interval + " minutes");
    doLogin();
}

function stripTrailingSlash(str) {
    if(str.substr(-1) == '/') {
        return str.substr(0, str.length - 1);
    }
    return str;
}
