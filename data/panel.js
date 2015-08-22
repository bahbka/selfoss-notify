var hiddenItem;
var expandedItems = {};

self.port.on("updateItems", function(items, updated, number, more, url, error) {
	var count = 0;
    var itemsArray = [];
    hiddenItem = null;

    for (var id in items) {
        if (items[id].unread == 1) {
            count++;
            if (count <= number) {
                itemsArray.push(generateEntry(items[id], url));
            } else {
                itemsArray.push(generateEntry(items[id], url, true));
                hiddenItem = items[id].id;
                break;
            }
        }
    }

    $(".items").html(itemsArray);

    $(".updated").html(updated);
    $(".more").html(more);

    if (error)
        $(".more").css("color", "red");
    else
        $(".more").css("color", "#3d6d69");
});

function generateEntry(item, url, hidden) {
    if (expandedItems[item.id] == null) expandedItems[item.id] = false; //TODO default value from settings

    var entry = '';

    entry += '<div class="entry" id="'+item.id+'"';
    if (hidden) entry += ' style="display: none;"';
    entry += '>';

    entry += '<img class="entry-icon" src="'+url+'/favicons/'+item.icon+'">';

    entry += '<img class="entry-unread" src="images/unread.png">';
    if (item.starred == 1)
        entry += '<img class="entry-star" src="images/starred.png">';
    else
        entry += '<img class="entry-star" src="images/unstarred.png">';
    entry += '<img class="entry-show" src="images/arrow.png"';
    if (expandedItems[item.id]) entry += ' style="-moz-transform: scaleY(-1);"';
    entry += '>';

    entry += '<h2 class="entry-title">'+item.title+'</h2>';
    entry += '<div class="entry-datetime"> • '+item.timeago+'</div>';
    entry += '<div class="entry-content"';

    if (!expandedItems[item.id]) entry += ' style="display: none;"';
    entry += '>'+item.content+'</div>';

    entry += "</div>";

    return entry;
}

self.port.on("panelResize", function() {
    self.port.emit("panel-resize", null, $(".items").height()+80);
});

self.port.on("cleanExpanded", function() {
    expandedItems = {};
});

$(".logo,.title,.control,.more,.updated").click(function() {
    if ($(this).attr('data-function') == "panel-refresh") expandedItems = {};
    self.port.emit($(this).attr('data-function'));
});

$(".items").delegate(".entry-title", "click", function() {
    self.port.emit("panel-open-item", $(this).parent().attr('id'));
});

$(".items").delegate("a", "click", function(event) {
    event.stopPropagation();
    event.preventDefault();
    self.port.emit("panel-open-link", $(this).attr("href"));
});

$(".items").delegate(".entry-star", "click", function(event) {
    event.stopPropagation();
    self.port.emit("panel-mark-star", $(this).parent().attr('id'));
});

$(".items").delegate(".entry-unread", "click", function(event) {
    event.stopPropagation();
    var id = $(this).parent().attr('id');
    $(this).parent().slideUp(function () {
        self.port.emit("panel-mark-read", id);
        delete expandedItems[id];
    });
    if (hiddenItem != null) $("#"+hiddenItem).slideDown();
});

$(".items").delegate(".entry-show", "click", function(event) {
    event.stopPropagation();
    var buttonIcon = $(this);
    var content = $(this).parent().children(".entry-content");
    var id = $(this).parent().attr('id');
    if (content.is(':hidden')) {
        self.port.emit("panel-resize", null, $(".items").height()+content.height()+80);
        content.slideDown(function() {
            self.port.emit("panel-resize", null, $(".items").height()+80);
            buttonIcon.css("-moz-transform", "scaleY(-1)");
            expandedItems[id] = true;
        });
    } else {
        content.slideUp(function() {
            self.port.emit("panel-resize", null, $(".items").height()+80);
            buttonIcon.css("-moz-transform", "scaleY(1)");
            expandedItems[id] = false;
        });
    }
});
