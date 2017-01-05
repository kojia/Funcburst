var dataset = makeNewNode("Root");
makeTree(dataset);

$(document).ready(function () {
    $('.modal').modal();
    $(".button-collapse").sideNav();
});

// SVG画面サイズ調整
$(document).ready(function () {
    hsize = $(window).height() - $("#top-nav").height();
    $("main").css("height", hsize + "px");
});
$(window).resize(function () {
    hsize = $(window).height() - $("#top-nav").height();
    $("main").css("height", hsize + "px");
});

// open file
$(document).ready(function () {
    $("#readjson").change(function (e) {
        var file = e.target.files[0];
        // FileReader.onloadイベントに
        // ファイル選択時に行いたい処理を書く
        var reader = new FileReader();
        reader.onload = function (e) {
            try {
                // JSONに変換
                dataset = $.parseJSON(reader.result);
            }
            catch (e) {
                // JSONではないファイルを読込んだとき
                alert("error: Invalid Data");
            }
            makeTree(dataset);
        };
        // Textとしてファイルを読み込む
        reader.readAsText(file);
    });
}, false);
// save file
$("#download").click(function () {
    var filename = $(".file-path.validate").val() || "function_tree.json";
    var outJson = JSON.stringify(dataset);
    var blob = new Blob([outJson], { "type": "text/plain" });
    if (window.navigator.msSaveBlob) {
        window.navigator.msSaveBlob(blob, filname);
    } else {
        var a = document.createElement('a');
        $("body").append(a);
        var url = window.URL.createObjectURL(blob);
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
    }
});
$("#dataURI").click(function () {
    var outJson = JSON.stringify(dataset, undefined, 2);
    window.open("data:;charset=utf-8," + encodeURIComponent(outJson));
});
// open svg in another window
$("#show-svg").click(function () {
    var svg = $("#treeSvg");
    var showsvg = $("<svg>");
    showsvg.attr({
        "xmlns": "http://www.w3.org/2000/svg",
        "width": $("#treeSvg").width() * 1.1,
        "height": $("#treeSvg").height() * 1.1
    });
    showsvg.html(svg.html());
    window.open("data:image/svg+xml,"
        + encodeURIComponent($("<div>").append(showsvg).html()));
});
// reload tree view
$("#reload").click(function () {
    d3.select("#node-edit")
        .style("display", "none");
    d3.select("#subnode-edit")
        .style("display", "none");
    makeTree(dataset);
})

function getNodeHeight() {
    return 15;
}
function getNodeWidth() {
    return 200;
}
function getNodeNameWidth() {
    return getNodeWidth() - 20;
}
function getSubNodeNameWidth() {
    return getNodeWidth() - 20;
}

function makeTree(dataset) {
    // svg initialize
    d3.select("#treeSvg").select("svg").remove();

    // hierarchy initialize
    root = d3.hierarchy(dataset, function (d) {
        return d["children"];
    });
    // set node name label string array to fit node width
    root.each(function (node) {
        node.label = splitStrByWidth(node.data.name, getNodeNameWidth());
    });

    // tree setting
    var tree = d3.tree()
        // .size([$(window).height() - $("#top-nav").height(), $("#treeSvg").width() * 0.9])
        .nodeSize([getNodeHeight(), getNodeWidth()])
        .separation(nodeSeparate);

    function nodeSeparate(a, b) {
        console.log(a.data.name, b.data.name);
        var sep = 3;  // space between nodes

        // ノードの幅広さを求める関数
        // 戻り値: 幅のarray, index 0: 上側の余白, index 1: 下側の余白
        var getWidth = function (node) {
            // 与えられたノードの幅を求める（子ノードを探索しない)
            var _oneNodeWidth = function (node) {
                var width = 0;
                width += node.label.length;
                node.data.sub.forEach(function (sub) {
                    width += Math.ceil(getStrWidth(sub.name) / getSubNodeNameWidth());
                })
                return width;
            }
            var childrenWidth = node.children == undefined ? 0
                : node.children
                    .reduce(function (_a, _b) {
                        return _a + _oneNodeWidth(_b) + sep;
                    }, 0);
            var width = _oneNodeWidth(node);
            var _result = Array();  //index 0: 上側の余白, index 1: 下側の余白
            _result[0] = childrenWidth / 2;
            _result[1] = width > childrenWidth / 2 ? width : childrenWidth / 2;
            return _result;
        };

        if (a.parent == b.parent) {
            var a_i = a.parent.children.indexOf(a);
            var b_i = b.parent.children.indexOf(b);
            var begin = a_i > b_i ? b_i : a_i;
            var end = a_i > b_i ? a_i : b_i;
            var _result = 0;
            for (var i = begin; i < end; i++) {
                _result += getWidth(a.parent.children[i])[1] + sep;
            }
            _result += getWidth(a.parent.children[end])[0];
            return _result;
        }
        else {
            var jptrA = getJptr(a);
            var jptrB = getJptr(b);
            var jptrIndex = 0;
            do {
                if (jptrA[jptrIndex] != jptrB[jptrIndex]) {
                    // aとbが兄弟関係の場合: jptrは数字が異なる
                    // aとbが親子関係の場合: jptrは"/"の有無で違いが発生
                    if (jptrA[jptrIndex] == "/") {
                    } else {
                        while (jptrA[jptrIndex] != "/") {
                            jptrIndex--;
                        }
                        jptrIndex -= 9;
                    }
                    break;
                }
                jptrIndex++
            } while (1)
            // jptrAとjptrBがともに持つ親ノード
            var rootAandB = perseJptr(root, jptrA.substring(0, jptrIndex))
            // 共通の親ノードまで遡ってノード幅広さを拡張する
            var widenForward = function (node, root, width = undefined) {
                var _width;
                if (width === undefined) {
                    _width = getWidth(node);
                } else {
                    _width = width;
                }
                if (node.parent == root || node == root) {
                    return { "node": node, "width": _width };
                } else {
                    // 同じ親に属するノードのうち、引数ノードより上側のノードの幅を加算
                    for (var i = 0; i < node.parent.children.indexOf(node); i++) {
                        _width[0] += getWidth(node.parent.children[i])[1]
                            + getWidth(node.parent.children[i])[1]
                            + sep;
                    }
                    // 同じ親に属するノードのうち、引数ノードより下側のノードの幅を加算
                    for (var i = node.parent.children.indexOf(node) + 1; i < node.parent.children.length; i++) {
                        _width[1] += getWidth(node.parent.children[i])[0]
                            + getWidth(node.parent.children[i])[1]
                            + sep;
                    }
                    return widenForward(node.parent, root, _width);
                }
            };
            // jptrAとjptrBを共通の親ノードまで遡る
            var widenA = widenForward(a, rootAandB);
            var widenB = widenForward(b, rootAandB);
            if (widenA.node == rootAandB || widenB.node == rootAandB) {
                return sep * 2;
            }
            // jptrAとjptrBの距離を求める
            var a_i = widenA.node.parent.children.indexOf(widenA.node);
            var b_i = widenB.node.parent.children.indexOf(widenB.node);
            var begin = a_i > b_i ? b_i : a_i;
            var end = a_i > b_i ? a_i : b_i;
            var _result = 0;
            for (var i = begin; i < end; i++) {
                if (i == a_i) {
                    _result += widenA.width[1] + sep;
                } else if (i == b_i) {
                    _result += widenB.width[1] + sep;
                } else {
                    _result += getWidth(widenA.node.parent.children[i])[1] + sep;
                }
            }
            console.log(widenA.node[0] + "  res: " + _result);
            return _result;
        }
    };

    // create tree layout
    tree(root);

    // sub nodeの計算
    // 幅方向単位長の計算
    var left = root;
    var right = root;
    var sep = 0;
    root.eachBefore(function (node) {
        if (node.x < left.x) {
            sep += tree.separation()(node, left);
            left = node;
        }
        if (node.x > right.x) {
            sep += tree.separation()(node, right);
            right = node;
        }
    });
    var treeWidth = (right.x - left.x) ? (right.x - left.x) : 1;
    var kx = treeWidth / sep; // 単位長
    // tree-nodesにsub nodesの情報を流し込む
    root.each(function (node) {
        node.sub = Array();  // create array for sub-node
        var lines = node.label.length;  // x座標オフセット量
        node.data.sub.forEach(function (subElm, i) {
            // parent のjsonpointerから対応するノードを得る
            var subPrnts = subElm.parents.map(function (p) {
                return perseJptr(root, p);
            });
            node.sub.push({
                "x": node.x + kx * lines,
                "y": node.y + kx / 2,
                "data": subElm,
                "parents": subPrnts,
                "belonging": node,  // subnodeが所属しているnode
                "label": splitStrByWidth(subElm.name, getSubNodeNameWidth())
            });
            // sub-nodeのlinesを追加する
            lines += splitStrByWidth(subElm.name, getSubNodeNameWidth()).length;
            // 引数のノードを親ノードの子ノードとして登録
            subPrnts.forEach(function (prntNode) {
                if (prntNode.children === undefined) {
                    prntNode.children = Array();
                }
                prntNode.children.push(node.sub[node.sub.length - 1])
            });
        });
    });
    // sub node のarrayを返す関数
    root.subDescendants = function () {
        return this.descendants()
            .map(function (elm) { return elm.sub; })
            .reduce(function (a, b) { return a.concat(b); }, Array());
    };
    // sub node の親子ペアのリストを返す
    root.subParentChild = function () {
        return this.subDescendants()
            .filter(function (elm) { return elm.parents.length; })
            .map(function (elm) {
                return elm.parents.map(function (prnt) {
                    return { "child": elm, "parent": prnt }
                })
            })
            .reduce(function (a, b) { return a.concat(b); }, Array());
    }

    // treeを入れるコンテナを作成
    var zoom = d3.zoom()
        .scaleExtent([.2, 10])
        .translateExtent(
        [[$("#treeSvg").width() * -2, $("#treeSvg").height() * -2],
        [$("#treeSvg").width() * 2, $("#treeSvg").height() * 2]])
        .on("zoom", zoomed);
    function zoomed() {
        d3.select(".treeContainer").attr("transform", d3.event.transform);
    }

    var svg = d3.select("#treeSvg")
        .append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .call(zoom);
    svg.append("g")
        .attr("class", "treeContainer");
    svg.call(zoom.transform, d3.zoomIdentity.scale(0.5));

    var k = $("#treeSvg").height() / treeWidth * 0.9;
    var ty = treeWidth * k / 2;
    if (k > 1) { k = 1; ty = $("svg").height() / 2; }
    svg.call(zoom.transform, d3.zoomIdentity
        .translate(10, ty)
        .scale(k));

    // ノード作成
    var node = d3.select(".treeContainer")
        .selectAll(".node")
        .data(root.descendants())
        .enter()
        .append("g");
    drawNode(node)

    // ノード間を線でつなぐ
    d3.select(".treeContainer").selectAll(".link")
        .data(root.descendants().slice(1))
        .enter()
        .append("path")
        .attr("class", "link")
        .attr("fill", "none")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", [2, 1])
        .attr("stroke", "black")
        .attr("d", function (d) {
            return "M" + d.y + "," + d.x
                + "C" + (d.y + d.parent.y) / 2 + "," + d.x
                + " " + (d.y + d.parent.y) / 2 + "," + d.parent.x
                + " " + d.parent.y + "," + d.parent.x;
        });


    // sub nodeをSVG描画
    var subNode = d3.select('.treeContainer')
        .selectAll(".subNode")
        .data(root.subDescendants())
        .enter()
        .append("g")
        .attr("class", "subNode")
        .attr("transform", function (d) {
            return "translate(" + d.y + "," + d.x + ")";
        });

    //subノードをつなぐ線の色を設定
    var xArray = root.subDescendants()
        .filter(function (node) {
            return node.belonging.height != 0;
        })
        .map(function (node) {
            return node.x;
        })
    var xMin = Math.min.apply(null, xArray);
    var xMax = Math.max.apply(null, xArray);
    var getLinkColor = function (x) {
        var h = 360 * (x - xMin) / (xMax - xMin);
        return "hsla(" + h + ",100%,60%,1)";
    };

    // subノードを線でつなぐ
    d3.select(".treeContainer").selectAll(".subLink")
        .data(root.subParentChild())
        .enter()
        .append("path")
        .attr("class", "subLink")
        .attr("fill", "none")
        .attr("stroke", function (d) { return getLinkColor(d.parent.x); })
        .attr("d", function (d) {
            return "M" + d.child.y + "," + d.child.x
                + "C" + (d.child.y + d.parent.y) / 1.8 + "," + d.child.x
                + " " + (d.child.y + d.parent.y) / 1.8 + "," + d.parent.x
                + " " + d.parent.y + "," + d.parent.x;
        });

    // sub-nodeのcircleとtextを描画
    drawSubNode(subNode);
};

function drawNode(node) {
    // ノードに円とテキストを表示
    node.attr("class", "node")
        .attr("transform", function (d) {
            return "translate(" + d.y + "," + d.x + ")";
        });
    // node.select("circle")
    //     .remove();
    node.append("circle")
        .attr("r", 4)
        .attr("fill", "steelblue");
    // node.select("text")
    //     .remove();
    node.append("text")
        .attr("font-size", getNodeHeight() + "px");
    node.select("text").html(function (d) { return tspanStringify(d.label, getNodeNameWidth()) });
    node.on("click", clickNode);
}
function tspanStringify(strArr, width) {
    var _html = "";
    strArr.forEach(function (str, index) {
        _html += '<tspan class="line' + index + '"' + 'y="' + index + 'em" x="0em">'
            + str + '</tspan>';
    });
    return _html;
}

// ノードクリック時の挙動
function clickNode(data) {
    console.log(data);

    d3.select("#node-edit")
        .style("display", "block");
    d3.select("#subnode-edit")
        .style("display", "none");

    // bind name
    document.nodeName.reset();  // reset form
    d3.select("#node-edit #name")
        .attr("value", data.data.name)
        .on("change", function () { 
            data.data.name = d3.event.target.value; 
            makeTree(dataset); 
        });
    // bind parent
    var prnt = d3.select("#node-edit .collection.parent")
        .selectAll("li.collection-item")
        .data(function () { return data.parent ? [data.parent] : []; });
    prnt.exit().remove();  // 減った要素を削除
    var enteredPrnt = prnt.enter()  // 増えた要素を追加
        .append("li")
    enteredPrnt.append("input");
    enteredPrnt.merge(prnt)  // 内容更新
        .attr("class", "collection-item")
        .select("input")
        .attr("type", "text")
        .attr("value", function (d) { return d === null ? "no parent" : d.data.name; });
    // bind children
    var cldrn = d3.select("#node-edit .collection.children")
        .selectAll("li.collection-item")
        .data(function () { return data.children ? data.children : []; });
    cldrn.exit().remove();
    var enteredCldrn = cldrn.enter()
        .append("li");
    enteredCldrn.merge(cldrn)
        .attr("class", "collection-item drag")
        .text(function (d) { return d.data.name; });
    // add remove button for children
    d3.select("#node-edit .collection.children")
        .selectAll("li.collection-item")
        .append("span").attr("class", "suffix")
        .append("i")
        .attr("class", "js-remove tiny material-icons")
        .text("remove_circle_outline");
    // insert add-child button
    var addChildBtn = d3.select("#node-edit .collection.children")
        .append("li").attr("class", "collection-item add")
        .append("button").attr("class", "waves-effect waves-light btn");
    addChildBtn.text("Add")
        .append("i").attr("class", "material-icons left")
        .text("add");
    // behavior when add-child button is clicked 
    addChildBtn.on("click", function () {
        var newName = window.prompt("Input new child node name.", "");
        if (newName === null) {
            return;
        }
        var newObj = makeNewNode(newName);
        if (data.data.children === undefined) {
            data.data["children"] = [];
        }
        data.data.children.push(newObj);
        makeTree(dataset);
    })
    // bind sub-nodes
    var sub = d3.select("#node-edit .collection.subnode")
        .selectAll("li.collection-item")
        .data(function () { return data.sub ? data.sub : []; });
    sub.exit().remove();
    var enteredSub = sub.enter()
        .append("li");
    var updatedSub = enteredSub.merge(sub)
        .attr("class", "collection-item drag")
        .text(function (d) { return d.data.name; });
    // add remove button for Sub Node
    updatedSub.append("span").attr("class", "suffix")
        .append("i")
        .attr("class", "js-remove tiny material-icons")
        .text("remove_circle_outline");
    // insert add-sub-node button
    var addSubBtn = d3.select("#node-subnode")
        .append("li").attr("class", "collection-item add")
        .append("button").attr("class", "waves-effect waves-light btn");
    addSubBtn.text("Add")
        .append("i").attr("class", "material-icons left")
        .text("add");
    // behavior when add-sub-node button is clicked 
    addSubBtn.on("click", function () {
        var newName = window.prompt("Input new sub node name.", "");
        if (newName === null) { return; }
        var newObj = makeNewSubNode(newName);
        if (data.data.sub === undefined) {
            data.data["sub"] = [];
        }
        data.data.sub.push(newObj);
        makeTree(dataset);
    })
    // Sortable List Option
    if ("nodeChildrenSort" in window) { nodeChildrenSort.destroy(); }
    var el = document.getElementById("node-children");
    nodeChildrenSort = Sortable.create(el, {
        draggable: ".collection-item.drag",
        filter: ".js-remove",
        onFilter: function (evt) {
            var item = evt.item;
            var ctrl = evt.target;
            if (Sortable.utils.is(ctrl, ".js-remove")) {  // Click on remove button
                item.parentNode.removeChild(item); // remove sortable item
                // 子要素の削除
                data.data.children.splice(evt.oldIndex - 1, 1);
                makeTree(dataset);
            }
        },
        // drag後の処理
        onUpdate: function (evt) {
            var _old = evt.oldIndex;
            var _new = evt.newIndex;
            var _jptr = getJptr(data);
            var _jptr_old = _jptr + "/children/" + (_old - 1);
            var _jptr_new = _jptr + "/children/" + (_new - 1);
            // replace json pointer of sub node
            var replaceSubParent = function (d, oldPtr, newPtr) {
                var re = RegExp("^" + oldPtr);
                d.descendants()
                    .reduce(function (a, b) { return a.concat(b.sub); }, Array())
                    .forEach(function (sub) {
                        sub.data.parents.forEach(function (prnt, i, arr) {
                            arr[i] = prnt.replace(re, newPtr)
                        })
                    })
            };
            // temporary variable of child element of evt.oldIndex
            var _t = data.data.children[_old - 1];
            // old <- new
            data.data.children[_old - 1] = data.data.children[_new - 1];
            replaceSubParent(data.children[_old - 1], _jptr_old, _jptr_new);
            // new <- old
            data.data.children[_new - 1] = _t;
            replaceSubParent(data.children[_new - 1], _jptr_new, _jptr_old);
            // データ再構築
            clearEditer();
            makeTree(dataset);
        }
    });
    // Sub Node のSortable設定
    if ("nodeSubSort" in window) { nodeSubSort.destroy(); }
    var el_sub = document.getElementById("node-subnode");
    nodeSubSort = Sortable.create(el_sub, {
        draggable: ".collection-item.drag",
        filter: ".js-remove",
        onFilter: function (evt) {
            var item = evt.item;
            var ctrl = evt.target;
            if (Sortable.utils.is(ctrl, ".js-remove")) {  // Click on remove button
                item.parentNode.removeChild(item); // remove sortable item
                // dataから削除
                data.data.sub.splice(evt.oldIndex - 1, 1);
                // 削除したsub nodeを親としているjson pointerを削除
                var _jptr = getJptr(data) + "/sub/" + String(evt.oldIndex - 1);
                delJptr(data, _jptr);
                makeTree(dataset);
            }
        },
        // drag後の処理
        onUpdate: function (evt) {
            var _old = evt.oldIndex;
            var _new = evt.newIndex;
            var _jptr = getJptr(data);
            var _jptr_old = _jptr + "/sub/" + (_old - 1);
            var _jptr_new = _jptr + "/sub/" + (_new - 1);
            // temporary variable for sub-node element of evt.oldIndex
            var _t = data.data.sub[_old - 1];
            // old <- new
            data.data.sub[_old - 1] = data.data.sub[_new - 1];
            // new <- old
            data.data.sub[_new - 1] = _t;
            // swap
            swapJptr(data, _jptr_old, _jptr_new);
            // データ再構築
            clearEditer();
            makeTree(dataset);
        }
    });
}

function drawSubNode(subNode) {
    // subノードに円とテキストを表示
    subNode.append("circle")
        .attr("r", 3)
        .attr("fill", "green");
    subNode.append("text")
        .attr("font-size", getNodeHeight() + "px")
        .attr("fill", "gray")
        .attr("dominant-baseline", "middle");
    subNode.select("text")
        .html(function (d) { return tspanStringify(d.label, getSubNodeNameWidth()) });
    subNode.on("click", clickSubNode);
}

// サブノードクリック時の挙動
function clickSubNode(data) {
    console.log(data);

    d3.select("#subnode-edit")
        .style("display", "block");
    d3.select("#node-edit")
        .style("display", "none");

    // bind name
    document.subnodeName.reset();  // reset form
    d3.select("#subnode-edit #subname")
        .attr("value", data.data.name)
        .on("change", function () { 
            data.data.name = d3.event.target.value; 
            makeTree(dataset); 
        });

    // bind belonging node
    var belonging = d3.select("#subnode-belonging")
        .selectAll("li.collection-item")
        .data(function () { return data.belonging ? [data.belonging] : []; });
    belonging.exit().remove();
    var enteredBelonging = belonging.enter()
        .append("li");
    var updatedBelonging = enteredBelonging.merge(belonging)
        .attr("class", "collection-item")
        .text(function (d) { return d.data.name; });

    // bind parent
    d3.select("#subnode-parents .add")
        .remove();  // 以前に作成したaddボタンを削除
    var prnt = d3.select("#subnode-parents")
        .selectAll("li.collection-item")
        .data(function () { return data.parents ? data.parents : []; });
    prnt.exit().remove();  // 減った要素を削除
    var enteredPrnt = prnt.enter()  // 増えた要素を追加
        .append("li")
    var updatedPrnt = enteredPrnt.merge(prnt)  // 内容更新
        .attr("class", "collection-item drag")
        .text(function (d) { return d === null ? "no parent" : d.data.name; });
    // add remove button for Sub Node
    updatedPrnt.append("span").attr("class", "suffix")
        .append("i")
        .attr("class", "js-remove tiny material-icons")
        .text("remove_circle_outline");
    // insert add-parent button
    var addParentBtn = d3.select("#subnode-parents")
        .append("li").attr("class", "collection-item add")
        .append("button").attr("class", "waves-effect waves-light btn");
    addParentBtn.text("Add")
        .append("i").attr("class", "material-icons left")
        .text("add");
    // behavior when add-parent button is clicked 
    addParentBtn.on("click", function () {
        // 選択されているnodeより上位のノードのsubnodeを探索
        var ancSubnode = data.belonging.ancestors().slice(1)
            .reduce(function (pre, node) {
                return pre.concat(node.sub);
            }, Array())
            .filter(function (elm) {
                return data.parents.indexOf(elm) == -1;
            })
        var prnt = d3.select("#subnode-parent")
            .selectAll("a.collection-item")
            .data(ancSubnode);
        prnt.exit().remove();
        var enteredPrnt = prnt.enter()
            .append("a")
            .attr("href", "#!")
            .attr("class", "collection-item");
        enteredPrnt.append("div")
            .attr("class", "sub-prnt-name");
        enteredPrnt.append("div")
            .attr("class", "sub-belonging-name");
        var margedPrnt = enteredPrnt.merge(prnt);
        // show content of anciestral subnode
        margedPrnt.select(".sub-prnt-name")
            .text(function (d) {
                return d.data.name;
            })
        margedPrnt.select(".sub-belonging-name")
            .text(function (d) {
                return d.belonging.data.name;
            });
        // click時の挙動
        margedPrnt.on("click", function (prnt) {
            var _ptr = getJptr(prnt.belonging,
                "sub/" + prnt.belonging.sub.indexOf(prnt));
            data.data.parents.push(_ptr);
            // データ再構築
            $("#side-subnode-parent").sideNav("hide");
            makeTree(dataset);
        });
        $("#side-subnode-parent").sideNav("show");
    });
    // Sortable List Option of parents
    if ("subnodeParentsSort" in window) { subnodeParentsSort.destroy(); }
    var el = document.getElementById("subnode-parents");
    subnodeParentsSort = Sortable.create(el, {
        draggable: ".collection-item.drag",
        filter: ".js-remove",
        onFilter: function (evt) {
            var item = evt.item;
            var ctrl = evt.target;
            if (Sortable.utils.is(ctrl, ".js-remove")) {  // Click on remove button
                item.parentNode.removeChild(item); // remove sortable item
                // 子要素の削除
                data.data.parents.splice(evt.oldIndex - 1, 1);
                makeTree(dataset);
            }
        },
        // drag後の処理
        onUpdate: function (evt) {
            var _old = evt.oldIndex;
            var _new = evt.newIndex;
            var _oldPrnt = data.data.parents[_old - 1];
            data.data.parents[_old - 1] = data.data.parents[_new - 1];
            data.data.parents[_new - 1] = _oldPrnt;
            // データ再構築
            makeTree(dataset);
        }
    });

    var cldrn = d3.select("#subnode-children")
        .selectAll("li.collection-item")
        .data(function () { return data.children ? data.children : []; });
    cldrn.exit().remove();
    var enteredCldrn = cldrn.enter()
        .append("li");
    enteredCldrn.merge(cldrn)
        .attr("class", "collection-item drag")
        .text(function (d) { return d.data.name; });
    // add remove button for children
    d3.select("#node-edit .collection.children")
        .selectAll("li.collection-item")
        .append("span").attr("class", "suffix")
        .append("i")
        .attr("class", "js-remove tiny material-icons")
        .text("remove_circle_outline");
    // insert add-child button
    var addParentBtn = d3.select("#node-edit .collection.children")
        .append("li").attr("class", "collection-item add")
        .append("button").attr("class", "waves-effect waves-light btn");
    addParentBtn.text("Add")
        .append("i").attr("class", "material-icons left")
        .text("add");
    // behavior when add-child button is clicked 
    addParentBtn.on("click", function () {
        var newName = window.prompt("Input new child node name.", "");
        if (newName === null) {
            return;
        }
        var newObj = makeNewNode(newName);
        if (data.data.children === undefined) {
            data.data["children"] = [];
        }
        data.data.children.push(newObj);
        makeTree(dataset);
    })


    // Sub Node のSortable設定
    if ("nodeSubSort" in window) { nodeSubSort.destroy(); }
    var el_sub = document.getElementById("node-subnode");
    nodeSubSort = Sortable.create(el_sub, {
        draggable: ".collection-item.drag",
        filter: ".js-remove",
        onFilter: function (evt) {
            var item = evt.item;
            var ctrl = evt.target;
            if (Sortable.utils.is(ctrl, ".js-remove")) {  // Click on remove button
                item.parentNode.removeChild(item); // remove sortable item
                // dataから削除
                data.data.sub.splice(evt.oldIndex - 1, 1);
                // 削除したsub nodeを親としているjson pointerを削除
                var _jptr = getJptr(data) + "/sub/" + String(evt.oldIndex - 1);
                delJptr(data, _jptr);
                makeTree(dataset);
            }
        },
        // drag後の処理
        onUpdate: function (evt) {
            var _old = evt.oldIndex;
            var _new = evt.newIndex;
            var _jptr = getJptr(data);
            var _jptr_old = _jptr + "/sub/" + (_old - 1);
            var _jptr_new = _jptr + "/sub/" + (_new - 1);
            // temporary variable for sub-node element of evt.oldIndex
            var _t = data.data.sub[_old - 1];
            // old <- new
            data.data.sub[_old - 1] = data.data.sub[_new - 1];
            // new <- old
            data.data.sub[_new - 1] = _t;
            // swap
            swapJptr(data, _jptr_old, _jptr_new);
            // データ再構築
            clearEditer();
            makeTree(dataset);
        }
    });
}

// sidenavのnode editerを空にする
function clearEditer() {
    d3.select("#subnode-edit")
        .style("display", "none");
    d3.select("#node-edit")
        .style("display", "none");
}

// create dictionary of new node
function makeNewNode(name) {
    var dic = {};
    dic["name"] = name;
    dic["cat"] = "";
    dic["sub"] = [];
    dic["children"] = [];
    dic["attr"] = [];
    return dic;
}

// create dictionary of new sub node
function makeNewSubNode(name) {
    var dic = {};
    dic["name"] = name;
    dic["cat"] = "";
    dic["parents"] = [];
    dic["attr"] = [];
    return dic;
}

// get json-pointer of the node
function getJptr(node, ptr = "") {
    if (node.parent === null) {
        return "/" + ptr;
    } else {
        var _ref = node.parent.children.indexOf(node);
        var _ptr = ptr === "" ? "" : "/" + ptr;
        return getJptr(node.parent, "children/" + _ref + _ptr);
    }
}

// delete json pointerF
function delJptr(node, jptr) {
    var jptrRight = jptr.match(/\d+$/)[0];
    var jptrLeft = jptr.slice(0, -jptrRight.length);
    var re = RegExp("^" + jptrLeft)
    node.descendants().forEach(function (d) {
        d.data.sub.forEach(function (sub) {
            sub.parents.forEach(function (p, i, arr) {
                var splited = p.split(re);
                if (splited.length < 2) { return; }
                if (splited[1] == jptrRight) {
                    arr.splice(i, 1);
                }
                // 削除したsubより後の要素を繰り上げ
                else if (/\d+/.test(splited[1])) {
                    if (Number(splited[1]) > Number(jptrRight)) {
                        var newNum = Number(splited[1]) - 1;
                        sub.parents[i] = jptrLeft + String(newNum);
                    }
                }
            })
        })
    });
}
// swap json pointer
function swapJptr(node, oldJptr, newJptr) {
    var oldRe = RegExp("^" + oldJptr);
    var newRe = RegExp("^" + newJptr);
    node.descendants().forEach(function (d) {
        d.data.sub.forEach(function (sub) {
            sub.parents.forEach(function (p, i, arr) {
                var replaced = p.replace(oldRe, newJptr);
                if (replaced != p) {
                    arr[i] = replaced;
                    return;
                }
                replaced = p.replace(newRe, oldJptr);
                if (replaced != p) {
                    arr[i] = replaced;
                    return;
                }
            })
        })
    });
}

// HSLa文字列を自動生成
function randHSLa(h = [0, 360], s = [0, 100], l = [0, 100], a = [0, 1]) {
    var chk = function (arr, min, max) {
        if (arr[1] - arr[0] < 0) {
            throw new RangeError("reverse order");
        }
        if (arr[0] < min) {
            throw new RangeError("too small argument");
        }
        if (arr[1] > max) {
            throw new RangeError("too large argument");
        }
    }
    chk(h, 0, 360);
    chk(s, 0, 100);
    chk(l, 0, 100);
    chk(a, 0, 1);
    var rand = function (arr) { return Math.random() * (arr[1] - arr[0] + 1) + arr[0] };
    return "hsla(" + rand(h) + "," + rand(s) + "%," + rand(l) + "%, " + rand(a) + ")";
}

// 文字列幅測定
function getStrWidth(str) {
    var e = $("#ruler");
    var width = e.text(str).get(0).offsetWidth;
    e.empty();
    return width;
}

// 文字列を指定した幅で区切って配列で返す
function splitStrByWidth(str, width) {
    if (getStrWidth(str) <= width) {
        return Array(str);
    } else {
        var arr = Array();
        var index = 0;
        for (var i = 0; i < str.length; i++) {
            if (getStrWidth(str.substring(index, i)) > width) {
                arr.push(str.substring(index, i - 1));
                index = i - 1;
            }
        }
        arr.push(str.slice(index));
        return arr;
    }
}