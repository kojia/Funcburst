// @licence MIT

// initialize dataset and category
var dataset = Object();
var category = Object();
function readData(data = undefined) {
    if (data) {
        if (data.data) dataset = data.data;
        if (data.category) category = data.category;
    } else {
        dataset = makeNewComp("Root");
    }
}
function writeData() {
    return { "data": dataset, "category": category };
}
readData();

// Tree Model Object
function TreeModel(data) {
    this.data = data;
    this.root = Object();
    this.fmroot = Object();

    p = TreeModel.prototype;

    // hierararchlize Component Tree Model and set layout
    p.makeCompTreeModel = function () {
        this.root = d3.hierarchy(this.data, function (d) {
            return d["children"];
        });
        this.root.eachAfter(function (node) {
            // set array for component-node label which width adjusted by node width
            node.label = splitStrByWidth(node.data.name, getCompLabelWidth());
            // set function-node data
            node.func = Array();  // create array for func-node
            node.data.func.forEach(function (funcElm, i) {
                node.func.push({
                    "data": funcElm,
                    "isb": node,  // func-node is solved by solution "component-node"
                    "label": splitStrByWidth(funcElm.name, getFuncLabelWidth())
                });
            });
            // set parameter-node data
            node.param = Array();  // create array for param-node
            if (node.data.param == undefined) {
                node.data.param = Array();
            }
            node.data.param.forEach(function (paramElm, i) {
                node.param.push({
                    "data": paramElm,
                    "icb": node,  // param-node is constrained by solution "component-node"
                    "label": splitStrByWidth(paramElm.name, getParamLabelWidth())
                });
            });
            // set node.value (evaluate node width including comp, func, and param)
            var thisWidth = 1;
            thisWidth += node.label.length
                + node.func.reduce(function (a, b) {
                    return a + b.label.length;
                }, 0)
                + node.param.reduce(function (a, b) {
                    return a + b.label.length;
                }, 0);
            var childWidth = 0;
            if (node.children) {
                childWidth = node.children.reduce(function (a, b) {
                    return a + b.value;
                }, 0);
            }
            if (thisWidth > childWidth) {
                node.value = thisWidth;
            } else {
                node.value = childWidth;
            }
        });

        // func node のarrayを返す関数
        this.root.funcDescendants = function () {
            return this.descendants()
                .reduce(function (a, b) { return a.concat(b.func); }, Array());
        };
        // func node の親子ペアのリストを返す
        this.root.funcParentChild = function () {
            return this.funcDescendants()
                .filter(function (elm) { return elm.parents.length; })
                .map(function (elm) {
                    return elm.parents.map(function (prnt) {
                        return { "x": elm.x, "y": elm.y, "parent": prnt }
                    })
                })
                .reduce(function (a, b) { return a.concat(b); }, Array());
        }

        // param-node のarrayを返す関数
        this.root.paramDescendants = function () {
            return this.descendants()
                .reduce(function (a, b) { return a.concat(b.param); }, Array());
        }
        // param-node を子に持つペアのリストを返す
        this.root.paramParentChild = function () {
            return this.paramDescendants()
                .filter(function (elm) { return elm.parents.length; })
                .map(function (elm) {
                    return elm.parents.map(function (prnt) {
                        return { "x": elm.x, "y": elm.y, "parent": prnt }
                    })
                })
                .reduce(function (a, b) { return a.concat(b); }, Array());
        }

        // create tree layout
        var tree = d3.tree()
            // .size([$(window).height() - $("#top-nav").height(), $("#compTreeSVG").width() * 0.9])
            .nodeSize([getNodeHeight(), getNodeWidth()])
            .separation(separate(function (node) {
                return node.func.concat(node.param);
            }));
        tree(this.root);
        // labelの並列方向単位長
        var kx = getNodeHeight();
        // func-, param-nodeの親子関係リンク挿入とfunc-, param-nodeの表示位置計算
        var root = this.root
        this.root.each(function (node) {
            var lineOffset = node.label.length;  // x座標オフセット量
            node.func.forEach(function (funcElm, i, funcArr) {
                funcArr[i].x = node.x + kx * lineOffset;
                funcArr[i].y = node.y + kx / 2;
                // オフセット量加算
                lineOffset += funcElm.label.length;
                // set parent for each func-node
                funcArr[i].parents = funcElm.data.parents.map(function (p) {
                    var _r = parseJptr(root, p);
                    if (_r === undefined) {
                        console.log(p + " is invalid json pointer");
                        return;
                    }
                    return _r;
                });
                // add children of each func-node
                funcArr[i].parents.forEach(function (funcPrnt) {
                    if (funcPrnt.children === undefined) {
                        funcPrnt.children = Array();
                    }
                    funcPrnt.children.push(funcElm);
                })
            });
            node.param.forEach(function (paramElm, i, paramArr) {
                paramArr[i].x = node.x + kx * lineOffset;
                paramArr[i].y = node.y + kx;
                // オフセット量加算
                lineOffset += paramElm.label.length;
                // set parent for each param-node
                paramArr[i].parents = paramElm.data.parents.map(function (p) {
                    var _r = parseJptr(root, p);
                    if (_r === undefined) {
                        console.log(p + " is invalid json pointer");
                        return;
                    }
                    return _r;
                });
                // set child for parent func-node that is set above
                paramElm.parents.forEach(function (paramPrnt) {
                    if (paramPrnt.children === undefined) {
                        paramPrnt.children = Array();
                    }
                    paramPrnt.children.push(paramElm);
                })
                // parameter doesn't have children
                // (prameter doesn't have parameter)
            });
        });
    }

    // hierarchlize Function-Means Tree Model and set layout
    p.makeFMTreeModel = function () {
        // make object based by function means model hierarchy
        var fmData = {
            "fmcat": "root",
            "children": [],
            "node": { "data": { "name": "Customer" } }
        };
        var setFMchild = function (node) {
            if (node.children === undefined) {
                return Array();
            } else {
                return node.children
                    .filter(function (child) {
                        return child.isb !== undefined;
                    })
                    .map(function (childfunc) {
                        return {
                            "fmcat": "func",
                            "node": childfunc,
                            "children": [{
                                "fmcat": "means",
                                "node": childfunc.isb,
                                "children": setFMchild(childfunc),
                                "param": childfunc.children == undefined ? [] :
                                    childfunc.children.filter(function (e) {
                                        return e.isb === undefined;
                                    })
                            }]
                        }
                    })
            }
        }
        this.root.func.forEach(function (fnode) {
            fmData.children.push({
                "fmcat": "func",
                "node": fnode,
                "children": [{
                    "fmcat": "means",
                    "node": this.root,
                    "children": setFMchild(fnode),
                    "param": fnode.children == undefined ? [] :
                        fnode.children.filter(function (e) {
                            return e.isb === undefined;
                        })
                }]
            })
        }, this);

        // compute hierarchy for function means tree
        this.fmroot = d3.hierarchy(fmData, function (d) {
            return d["children"];
        })

        // set label, node, and data
        this.fmroot.eachBefore(function (fmnode) {
            fmnode.cnode = fmnode.data.node;
            fmnode.cdata = fmnode.data.node.data;
            fmnode.label = splitStrByWidth(
                fmnode.cdata.name, getFMLabelWidth());
            // set parameter node
            if (fmnode.data.fmcat == "means") {
                fmnode.param = fmnode.data.param
                    .map(function (d) {
                        return {
                            "cnode": d,
                            "cdata": d.data,
                            "label": splitStrByWidth(d.data.name, getFMLabelWidth())
                        };
                    });
            }
        })

        //tree setting
        var tree = d3.tree()
            .nodeSize([getFMNodeHeight(), getFMNodeWidth()])
            .separation(separate(function (node) {
                return node.param === undefined ? [] : node.param;
            }));
        // create tree layout
        tree(this.fmroot);
        // set coordinate of param node
        var kx = getNodeHeight(); // labelの並列方向単位長
        this.fmroot.each(function (node) {
            if (node.data.fmcat != "means") return;
            var lineOffset = node.label.length;
            node.param.forEach(function (p, i, arr) {
                arr[i].x = node.x + kx * lineOffset;
                arr[i].y = node.y - getFMNodeWidth() / 4;
                lineOffset += p.label.length;
            })
        });
    }

    // hierarchlize Funcburst Model
    p.makeFuncburstModel = function () {
        var partition = d3.partition();
        partition(this.root);

        var radian = d3.scaleLinear()
            .range([0, 2 * Math.PI]);

        // lays out each node onto the funcburst.
        var dx = 1 / this.root.value;
        var dy = 1 / (this.root.height + 1);
        this.root.descendants().forEach(function (node) {
            var funcAndParam = node.func.concat(node.param);
            var space = dx * node.value / (funcAndParam.length);
            // func/param-node radius
            var radius = (node.depth + 0.5) * dy;  // node circle center
            var radiusInner = (node.depth + 0.4) * dy;  // for link start point
            var radiusOuter = (node.depth + 0.6) * dy;  // for link end point

            // y coordinates of parent's func/param-node
            var prntFpY = Array();
            if (node.parent) {
                prntFpY = node.parent.func.concat(node.parent.param)
                    .map(function (prntFp) {
                        return prntFp.yfb;
                    });
            }

            funcAndParam.forEach(function (fpNode, i) {
                fpNode.x0 = node.x0 + (i + 0.5) * space;
                fpNode.y0 = radius;

                // angle index
                var a = [0, 0.5, 1]
                    .map(function (_a) {
                        return node.x0 + (i + _a) * space;
                    });
                // y = [yMin, yCtr, yMax]
                var y = a.map(function (_a) {
                    return radius * Math.cos(radian(_a)) * -1;
                }).sort(function (_a, _b) { return _a - _b; });
                // scan parent's minimum y coordinate and replace y[0]
                prntFpY.filter(
                    function (value) {
                        return value > y[0] && value < y[1];
                    })
                    .filter(function (val, i, arr) {
                        return val == Math.max.apply(null, arr);
                    })
                    .forEach(function (d) {
                        y[0] = d;
                    });
                // scan parent's maximum y coordinate and replace y[2]
                prntFpY
                    .filter(function (value) {
                        return value > y[1] && value < y[2];
                    })
                    .filter(function (val, i, arr) {
                        return val == Math.min.apply(null, arr);
                    })
                    .forEach(function (d) {
                        y[2] = d;
                    });
                // set func/param-node x,y coordinate: xfb and yfb
                fpNode.yfb = (y[0] + y[2]) / 2;
                var angle = Math.asin(fpNode.yfb / radius);
                if (a[1] > 0.5) { angle = Math.PI - angle; }
                fpNode.xfb = radius * Math.cos(angle);
                fpNode.xfbS = radiusInner * Math.cos(angle);
                fpNode.yfbS = radiusInner * Math.sin(angle);
                fpNode.xfbE = radiusOuter * Math.cos(angle);
                fpNode.yfbE = radiusOuter * Math.sin(angle);
                fpNode.anglefb = angle;
            });
        });

    }
}

// Tree View Interface
var ITree = function (selector) {
    this.svg = d3.select(selector);
    this.zoomer = this.setZoom();
};
(function () {
    p = ITree.prototype;
    p.isActiveSVG = function () {
        if (this.svg.style("display") == "none") {
            return false;
        }
        return true;
    };
    p.drawSVG = function (model, fit) { };
    p.setZoom = function () {
        var zoomed = function (svg) {
            return function () {
                svg.select(".treeContainer")
                    .attr("transform", d3.event.transform);
            }
        }
        var zoomer = d3.zoom()
            .scaleExtent([.2, 10])
            // .translateExtent(
            // [[$("#compTreeSVG").width() * -2, $("#compTreeSVG").height() * -2],
            // [$("#compTreeSVG").width() * 2, $("#compTreeSVG").height() * 2]])
            .on("zoom", zoomed(this.svg));
        this.svg
            .attr("width", "100%")
            .attr("height", "100%")
            .call(zoomer);

        return zoomer;
    }
    // fit drawing to the SVG field by offset and scale adjustment
    p.fit = function (xOffset = undefined) {
        var _is_block = true;
        if (this.svg.style("display") == "none") {
            _is_block = false;
            this.svg.style("display", "block");
        }
        // var bbox = $("#compTreeSVG .treeContainer")[0].getBBox();
        var bbox = this.svg.select(".treeContainer").node().getBBox();
        var ky = parseInt(this.svg.style("height")) / bbox.height * 0.9;
        var kx = parseInt(this.svg.style("width")) / bbox.width * 0.9;
        var k = ky > kx ? kx : ky;
        var ty = bbox.height / 2 * k;
        var tx = 10;
        if (xOffset) {
            tx += bbox.width / 2 * k;
        }
        this.svg.call(this.zoomer.transform, d3.zoomIdentity
            .translate(tx, ty + 2 * getNodeHeight())
            .scale(k));
        if (_is_block == false) {
            this.svg.style("display", "none");
        }
    };
}())

// View Object for Component Tree
var ComponentTree = function () {
    ITree.call(this, "#comp-tree");

    // geranerate SVG field
    this.drawSVG = function (model) {
        // func-nodeをSVG描画
        // func-nodeをつなぐ線の色を設定
        var xArray = model.root.funcDescendants()
            .map(function (node) {
                return node.x;
            })
        var xMin = Math.min.apply(null, xArray);
        var xMax = Math.max.apply(null, xArray);
        var getLinkColor = function (x) {
            var h = 350 * (x - xMin) / (xMax - xMin);
            return "hsla(" + h + ",100%,60%,1)";
        };
        // ノード間を線でつなぐ
        drawLink(model.root.descendants().slice(1), "comp");
        drawLink(model.root.funcParentChild(), "func");
        drawLink(model.root.paramParentChild(), "param");
        function drawLink(nodeArr, type) {
            var className = type + "Link";
            var strokeWidth = { "comp": 2.5, "func": 1, "param": 1 };
            var strokeDasharray = { "comp": [2, 1], "func": undefined, "param": undefined };
            var strokeColor = {
                "comp": "gray",
                "func": function (d) { return getLinkColor(d.x); },
                "param": function (d) { return getLinkColor(d.x); }
            };
            var curve = { "comp": 2, "func": 1.8, "param": 1.8 }

            var link = d3.select("#compTreeSVG .treeContainer .link")
                .selectAll("." + className)
                .data(nodeArr);
            link.exit().remove();
            var enteredLink = link.enter()
                .append("path");
            enteredLink.merge(link)
                .attr("class", className)
                .attr("fill", "none")
                .attr("stroke-width", strokeWidth[type])
                .attr("stroke-dasharray", strokeDasharray[type])
                .attr("stroke", strokeColor[type])
                .attr("d", function (d) {
                    if (Math.abs(d.y - d.parent.y) < getNodeWidth()) { // 同じdepthの場合
                        return "M" + d.y + "," + d.x
                            + "C" + (d.y - getNodeHeight() * 2) + "," + (d.x + d.parent.x) / 2
                            + " " + (d.y + getNodeHeight() * 2) + "," + d.parent.x
                            + " " + d.parent.y + "," + d.parent.x;
                    } else {
                        return "M" + d.y + "," + d.x
                            + "C" + (d.y + d.parent.y) / curve[type] + "," + d.x
                            + " " + (d.y + d.parent.y) / curve[type] + "," + d.parent.x
                            + " " + d.parent.y + "," + d.parent.x;
                    }
                });
        }

        // ノード作成
        var drawNode = function (nodeArr, type, root) {
            var className = type + "Node";
            var circleRadius = { "comp": 4, "func": 3, "param": 3 };
            var circleColor = { "comp": "teal", "func": "red", "param": "orange" };
            var _clickCompNode = function (node, i, a) {
                return clickCompNode(node, i, a, root);
            }
            var _clickFuncNode = function (node, i, a) {
                return clickFuncNode(node, i, a, root);
            }
            var _clickParamNode = function (node, i, a) {
                return clickParamNode(node, i, a, root);
            }
            var clickFunc = { "comp": _clickCompNode, "func": _clickFuncNode, "param": _clickParamNode };
            var node = d3.select("#compTreeSVG .treeContainer .node")
                .selectAll("." + className)
                .data(nodeArr);
            node.exit().remove();
            var enteredNode = node.enter()
                .append("g").attr("class", className);
            enteredNode.append("circle")
                .attr("r", circleRadius[type])
                .attr("fill", circleColor[type]);
            enteredNode.append("text");
            var updatedNode = enteredNode.merge(node);
            // ノードに円とテキストを表示
            updatedNode
                .attr("transform", function (d) {
                    return "translate(" + d.y + "," + d.x + ")";
                });
            updatedNode.select("text").html(function (d) { return tspanStringify(d.label) });
            updatedNode.on("click", clickFunc[type]);
            updatedNode.call(styleNode);
        }
        drawNode(model.root.descendants(), "comp", model.root);
        drawNode(model.root.funcDescendants(), "func", model.root);
        drawNode(model.root.paramDescendants(), "param", model.root);
    };
}
// inherit
ComponentTree.prototype = Object.create(ITree.prototype);
ComponentTree.prototype.constructor = ComponentTree;

// View Object for Function Means Tree
var FMTree = function () {
    ITree.call(this, "#FM-tree");

    // geranerate SVG field
    this.drawSVG = function (model) {
        // svg initialize
        d3.select("#FMTreeSVG").select("svg").remove();

        // ノード間を線でつなぐ
        var link = d3.select("#FMTreeSVG .treeContainer").selectAll(".link")
            .data(model.fmroot.descendants().slice(1));
        link.exit().remove();
        var enteredLink = link.enter()
            .append("path");
        enteredLink.merge(link)
            .attr("class", "link")
            .attr("fill", "none")
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", [2, 1])
            .attr("stroke", "gray")
            .attr("d", function (d) {
                return "M" + d.y + "," + d.x
                    + "C" + (d.y + d.parent.y) / 2 + "," + d.x
                    + " " + (d.y + d.parent.y) / 2 + "," + d.parent.x
                    + " " + d.parent.y + "," + d.parent.x;
            });

        // ノード作成
        var node = d3.select("#FMTreeSVG .treeContainer")
            .selectAll(".node")
            .data(model.fmroot.descendants());
        node.exit().remove();
        var enteredNode = node.enter()
            .append("g");
        enteredNode.append("circle");
        enteredNode.append("text")
            .attr("font-size", getFMNodeHeight() + "px");
        var updatedNode = enteredNode.merge(node);
        updatedNode.attr("class", "node")
            .attr("transform", function (d) {
                return "translate(" + d.y + "," + d.x + ")";
            });
        updatedNode.select("circle")
            .attr("r", 4)
            .attr("fill", function (d) {
                if (d.data.fmcat == "func") {
                    return "red";
                } else {
                    return "teal";
                }
            });
        updatedNode.select("text")
            .html(function (d) { return tspanStringify(d.label); });
        // draw parameter node 
        var paramData = model.fmroot.descendants()
            .filter(function (d) { return d.data.fmcat === "means" })
            .reduce(function (a, b) { return a.concat(b.param); }, Array());
        var param = d3.select("#FMTreeSVG .treeContainer")
            .selectAll(".paramNode")
            .data(paramData);
        param.exit().remove();
        var enteredParam = param.enter()
            .append("g");
        enteredParam.append("circle");
        enteredParam.append("text")
            .attr("font-size", getFMNodeHeight() * 0.8 + "px");
        var updatedParam = enteredParam.merge(param);
        updatedParam.attr("class", "paramNode")
            .attr("transform", function (d) {
                return "translate(" + d.y + "," + d.x + ")";
            });
        updatedParam.select("circle")
            .attr("r", 3)
            .attr("fill", "orange");
        updatedParam.select("text")
            .html(function (d) { return tspanStringify(d.label); });
    }
}
// inherit
FMTree.prototype = Object.create(ITree.prototype);
FMTree.prototype.constructor = FMTree;

// View Object for Funcburst
var Funcburst = function () {
    ITree.call(this, "#funcburst");

    // draw funcburst SVG
    this.drawSVG = function (model) {
        var radius = 300;
        var color = d3.scaleOrdinal(d3.schemeCategory20);

        var theta = d3.scaleLinear()
            .range([0, 2 * Math.PI]);

        var r = d3.scaleLinear()
            .range([0, radius]);

        var cellArc = d3.arc()
            .startAngle(function (d) { return Math.max(0, Math.min(2 * Math.PI, theta(d.x0))); })
            .endAngle(function (d) {
                if (d.x0 == 0 && d.x1 == 1) {
                    return 2 * Math.PI;
                }
                return theta(d.x1) - 0.02;
            })
            .innerRadius(function (d) { return Math.max(0, r(d.y0)); })
            .outerRadius(function (d) {
                return r(d.y1 - 0.01);
            });

        // draw sunburst
        var cell = this.svg.select(".cell").selectAll(".node")
            .data(model.root.descendants());
        cell.exit().remove();
        var enteredCell = cell.enter()
            .append("path");
        enteredCell.merge(cell)
            .attr("class", "node")
            .attr("d", cellArc)
            .style("fill", function (d) { return color(d.data.name); });

        // draw Labels for Component on each sunburst cell
        // define curve path, based on which the label is drawn
        var lblBase = this.svg.select("defs").selectAll(".compLabelBase")
            .data(model.root.descendants());
        lblBase.exit().remove();
        var enteredlblBase = lblBase.enter()
            .append("path");
        enteredlblBase.merge(lblBase)
            .attr("class", "compLabelBase")
            .attr("id", function (d, i) {
                return "lblBase" + i;
            })
            .attr("d", function (d, i) {
                var _r = r(d.y0) + (r(d.y1) - r(d.y0)) * 0.15;
                var _startTheta = theta(d.x0);
                var _endTheta = theta(d.x1);
                if (i == 0) {
                    _r = r(d.y1);
                    return "M" + (_r * -1) + " 0 H" + _r;
                }
                if (_startTheta == 0 && _endTheta == 2 * Math.PI) {
                    _startTheta = Math.PI / 2;
                    _endTheta = Math.PI * 3 / 2;
                }
                // label with PI/2 < angle < 3PI/2 is flipped vertically
                var aveTheta = (_startTheta + _endTheta) / 2
                if (aveTheta > Math.PI / 2 && aveTheta < Math.PI * 3 / 2) {
                    var mx = _r * Math.sin(_endTheta);
                    var my = _r * Math.cos(_endTheta) * -1;
                    var sweep = 0;
                    var ax = _r * Math.sin(_startTheta);
                    var ay = _r * Math.cos(_startTheta) * -1;
                } else {
                    var mx = _r * Math.sin(_startTheta);
                    var my = _r * Math.cos(_startTheta) * -1;
                    var sweep = 1;
                    var ax = _r * Math.sin(_endTheta);
                    var ay = _r * Math.cos(_endTheta) * -1;
                }
                return "M" + mx + " " + my + "A" + _r + " " + _r + ", 0, 0, "
                    + sweep + "," + ax + " " + ay;
            });

        var compLabel = this.svg.select(".cLabel").selectAll("text")
            .data(model.root.descendants());
        compLabel.exit().remove();
        var enteredCompLabel = compLabel.enter()
            .append("text");
        enteredCompLabel.append("textPath");
        enteredCompLabel.merge(compLabel)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "central")
            .attr("fill", "white")
            .select("textPath")
            .attr("xlink:href", function (d, i) {
                return "#lblBase" + i;
            })
            .attr("startOffset", "50%")
            .text(function (d) { return d.data.name; });

        // draw link between func/param-nodes
        var linkPairs = model.root.funcDescendants()
            .concat(model.root.paramDescendants())
            .map(function (child) {
                return child.parents.map(function (parent) {
                    return { "c": child, "p": parent };
                })
            })
            .reduce(function (a, b) {
                return a.concat(b);
            }, Array());
        var fpLink = this.svg.select(".fpLink").selectAll(".fpLinkPath")
            .data(linkPairs);
        fpLink.exit().remove();
        var enteredFpLink = fpLink.enter()
            .append("g")
            .attr("class", "fpLinkPath");
        enteredFpLink.append("path").attr("class", "start");
        enteredFpLink.append("path").attr("class", "link");
        enteredFpLink.append("path").attr("class", "end");
        var updatedFpLink = enteredFpLink.merge(fpLink);
        updatedFpLink.select(".link")
            .attr("stroke", function (d) {
                var _x = 0, _y = 0;
                if (d.c.xfbS > d.p.xfbE) { _x = 1; }
                if (d.c.yfbS > d.p.yfbE) { _y = 1; }
                return "url(#rg" + String(_x) + String(_y) + ")";

            })
            .attr("fill", "none")
            .attr("d", function (d) {
                var sx = radius * d.c.xfbS;
                var sy = radius * d.c.yfbS;
                var ex = radius * d.p.xfbE;
                var ey = radius * d.p.yfbE;
                var q1x = sx - 0.2 * radius * Math.cos(d.c.anglefb);
                var q1y = sy - 0.2 * radius * Math.sin(d.c.anglefb);
                var q2x = ex + 0.2 * radius * Math.cos(d.p.anglefb);
                var q2y = ey + 0.2 * radius * Math.sin(d.p.anglefb);;
                return "M" + sx + "," + sy + " C" + q1x + "," + q1y + "," + q2x + "," + q2y
                    + "," + ex + "," + ey;
            });
        updatedFpLink.select(".start")
            .attr("stroke", "cyan").attr("fill", "none")
            .attr("d", function (d) {
                return "M" + radius * d.c.xfb + "," + radius * d.c.yfb
                    + " L" + radius * d.c.xfbS + "," + radius * d.c.yfbS;
            });
        updatedFpLink.select(".end")
            .attr("stroke", "#ffff1a").attr("fill", "none")
            .attr("d", function (d) {
                return "M" + radius * d.p.xfbE + "," + radius * d.p.yfbE
                    + " L" + radius * d.p.xfb + "," + radius * d.p.yfb;
            });
        updatedFpLink.selectAll("path")
            .attr("stroke-linecap", "round");

        // draw func- and param-node
        var fpLabel = this.svg.select(".fpLabel").selectAll("g")
            .data(model.root.funcDescendants().concat(model.root.paramDescendants()));
        fpLabel.exit().remove();
        var enteredFpLabel = fpLabel.enter()
            .append("g");
        enteredFpLabel.append("circle");
        enteredFpLabel.append("text");
        var updatedFpLabel = enteredFpLabel.merge(fpLabel)
            .attr("transform", function (d) {
                return "translate(" + radius * d.xfb + "," + radius * d.yfb + ")";
            });
        updatedFpLabel.select("circle")
            .attr("r", 4)
            .attr("fill", function (d) {
                if (d.isb == undefined) {
                    return "orange";  // parameter
                } else {
                    return "red";  // function
                }
            })
            .attr("stroke", "white");
        updatedFpLabel.select("text")
            .attr("text-anchor", function (d) {
                if (d.xfb < 0) {
                    return "end";
                }
            })
            .text(function (d) {
                return d.data.name;
            })
    }

    this.fit = function () {
        ITree.prototype.fit.call(this, xOffset = true);
    }
}
// inherit
Funcburst.prototype = Object.create(ITree.prototype);
Funcburst.prototype.constructor = Funcburst;

// tree instances controller
var TreeController = function (data) {
    this.model = new TreeModel(data);

    // view
    this.trees = Array();
    this.trees.push(new ComponentTree());
    this.trees.push(new FMTree());
    this.trees.push(new Funcburst());

    // prototype
    p = TreeController.prototype;
    // set data
    p.setData = function (data) {
        this.model.data = data;
    }
    // モデル再計算
    p.computeModel = function () {
        this.model.makeCompTreeModel();
        this.model.makeFMTreeModel();
        this.model.makeFuncburstModel();
    }
    // Tree viewの再描画
    p.drawSVG = function (fit) {
        this.trees
            .filter(function (tree) {
                return tree.isActiveSVG();
            })
            .forEach(function (tree) {
                tree.drawSVG(this.model);
                tree.fit();
            }, this)
    }
    // headerのreloadがclickされたときの挙動
    p.reload = function () {
        this.computeModel();
        this.drawSVG(true);
    };
    // 画面遷移したことをtreeのインスタンスに通知
    p.notice = function () {
    };
};
var trees = new TreeController(dataset);


// get URL parameter and read initial data
if (1 < document.location.search.length) {
    var query = document.location.search.substring(1);
    var param = query.split("&");
    var paramMap = Object();
    param.forEach(function (e) {
        var _elem = e.split("=");
        var _key = decodeURIComponent(_elem[0]);
        var _item = decodeURIComponent(_elem[1]);
        paramMap[_key] = _item;
    });
    if (paramMap["data"]) {
        d3.json(paramMap["data"], function (error, data) {
            if (!error) {
                readData(data);
            }
            trees.setData(dataset);
        });
    } else {
        trees.setData(dataset);
    }
} else {
    trees.setData(dataset);
}

// initialize materialize plugin and SVG window-size
$(document).ready(function () {
    // materialize initialization
    $('.modal').modal();
    $(".button-collapse").sideNav();
    $("select").material_select();
    // SVG画面サイズ調整
    var resizeSVG = function () {
        hsize = $(window).height() - ($("#top-nav").height() + $("#tree-tab").height()) - 5;
        $("main").css("height", hsize + "px");
    }
    resizeSVG();
    $(window).resize(function () {
        resizeSVG();
    });
    trees.reload(fit = true);
});

// crate new file
$("#create-new").click(function () {
    var _createNew = function () {
        dataset = makeNewComp("Root");
        trees.setData(dataset);
        highlightNode();
    }
    confirmDelNode("", _createNew, "Are you sure you want to create new tree? Unsaved data will be lost.");
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
                _data = $.parseJSON(reader.result);
                dataset = _data.data;
                trees.setData(dataset);
                trees.reload(fit = true);
            }
            catch (e) {
                // JSONではないファイルを読込んだとき
                alert("error: Invalid Data");
            }
            setEditPane();
        };
        // Textとしてファイルを読み込む
        reader.readAsText(file);
    });
}, false);
// save file
$("#download").click(function () {
    var filename = $(".file-path.validate").val() || "function_tree.json";
    var outJson = JSON.stringify(writeData(), undefined, 2);
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
    var outJson = JSON.stringify(writeData(), undefined, 2);
    window.open("data:;charset=utf-8," + encodeURIComponent(outJson));
});
// open svg in another window
$("#show-svg").click(function () {
    var svg = $("#compTreeSVG");
    var showsvg = $("<svg>");
    showsvg.attr({
        "xmlns": "http://www.w3.org/2000/svg",
        "width": $("#compTreeSVG").width() * 1.1,
        "height": $("#compTreeSVG").height() * 1.1
    });
    showsvg.html(svg.html());
    window.open("data:image/svg+xml;charset=utf-8,"
        + encodeURIComponent($("<div>").append(showsvg).html()));
});
// reload action when reload button is clicked
$("#reload").click(function () {
    trees.reload(fit = true);
    setEditPane();
});
// reload action when tab transition
var tabObserver = new MutationObserver(function (rec, obs) {
    trees.reload(fit = true);
    setEditPane();
});
// 各ツリーすべてを監視できるようにする必要あり
tabObserver.observe($("main div.container").get(0), {
    attributes: true
})
tabObserver.observe($("main div.container").get(1), {
    attributes: true
})


function getNodeHeight() {
    return 15;
}
function getNodeWidth() {
    return 250;
}
function getCompLabelWidth() {
    return getNodeWidth() - 20;
}
function getFuncLabelWidth() {
    return getNodeWidth() - 20;
}
function getParamLabelWidth() {
    return getNodeWidth() - 30;
}



function tspanStringify(strArr) {
    var _html = "";
    strArr.forEach(function (str, index) {
        _html += '<tspan class="line' + index + '"' + 'y="' + index + 'em" x="0em">'
            + str + '</tspan>';
    });
    return _html;
}

// componentノードクリック時の挙動
function clickCompNode(node, i, a, root) {
    console.log(node);
    var root = root;
    setEditPane("comp");
    highlightNode(node);

    // bind name
    d3.select("#comp-edit .node-name form")
        .call(bindName, node);
    // bind category
    d3.select("#comp-edit .category")
        .call(bindCategory, node, a[i], "comp");
    // bind parent
    var prnt = d3.select("#comp-parent")
        .selectAll("li.collection-item")
        .data(function () { return node.parent ? [node.parent] : []; });
    prnt.exit().remove();  // 減った要素を削除
    var enteredPrnt = prnt.enter()  // 増えた要素を追加
        .append("li");
    enteredPrnt.append("input");
    enteredPrnt.merge(prnt)  // 内容更新
        .attr("class", "collection-item")
        .text(function (d) { return d === null ? "no parent" : d.data.name; });
    // change component parent
    d3.select("#btn-change-comp-parent")
        .on("click", function () {
            d3.select("#nav-change-comp-parent .collection-header")
                .text('Select Parent of "' + node.data.name + '"');
            var prnts = []; // parent候補
            var dataPtr = getJptr(node);
            var dataPtrRe = RegExp("^" + dataPtr);
            root.eachBefore(function (node) {
                // 選択しているnodeのdescendantは除く
                if (getJptr(node).match(dataPtrRe)) {
                    return;
                }
                prnts.push(node);
            });
            var prnt = d3.select("#nav-change-comp-parent")
                .selectAll("a.collection-item")
                .data(prnts);
            prnt.exit().remove();
            var enteredPrnt = prnt.enter()
                .append("a")
                .attr("href", "#!")
                .attr("class", "collection-item");
            enteredPrnt.append("div");
            var margedPrnt = enteredPrnt.merge(prnt);
            // show addiable component
            margedPrnt
                .classed("disabled", function (d) {
                    return d == node.parent ? true : false;
                })
                .style("color", function (d) {
                    if (this.getAttribute("class").match(/disabled/)) {
                        return "red";
                    } else {
                        return;
                    }
                })
                .text(function (d) {
                    return "*".repeat(d.depth) + d.data.name;
                })
                .on("click", function (d) {
                    if (this.getAttribute("class").match(/disabled/)) {
                        return;
                    } else {
                        $("#link-nav-change-comp-parent").sideNav("hide");
                        return changeParent(d);
                    }
                })
            var changeParent = function (prnt) {
                var oldIndex = node.parent.children.indexOf(node);
                var oldPtr = getJptr(node);
                var newIndex = prnt.data.children === undefined ? 0 : prnt.data.children.length;
                var newPtr = getJptr(prnt) + "/children/" + newIndex;
                swapJptr(node, oldPtr, newPtr);
                if (prnt.data.children === undefined) {
                    prnt.data.children = Array();
                }
                prnt.data.children.push(node.data);
                node.parent.data.children.splice(oldIndex, 1);
                delJptr(oldPtr, root);
                trees.reload(fit = true);
                setEditPane();
            }
            $("#link-nav-change-comp-parent").sideNav("show");
        });

    // bind children
    var cldrn = d3.select("#comp-children")
        .selectAll("li.collection-item")
        .data(function () { return node.children ? node.children : []; });
    cldrn.exit().remove();
    var enteredCldrn = cldrn.enter()
        .append("li");
    enteredCldrn.merge(cldrn)
        .attr("class", "collection-item drag")
        .text(function (d) { return d.data.name; });
    // add remove button for children
    d3.select("#comp-children")
        .selectAll("li.collection-item")
        .call(addRemoveIcon);
    // insert add-child button
    var addChildBtn = d3.select("#comp-children")
        .append("li")
        .attr("class", "collection-item add")
        .append("button")
        .attr("class", "waves-effect waves-light btn")
        .attr("href", "#modal-comp-add-child");
    addChildBtn.text("Add")
        .append("i").attr("class", "material-icons left")
        .text("add");
    // behavior when add-child button is clicked 
    var addChild = function () {
        var _compName = $("#input-comp-add-child").val();
        var newObj = makeNewComp(_compName);
        if (node.data.children === undefined) {
            node.data["children"] = [];
        }
        node.data.children.push(newObj);
        var _jptr = getJptr(node);
        trees.reload(fit = true);
        clickCompNode(parseJptr(root, _jptr), i, a, root);
    }
    addChildBtn.on("click", function () {
        $("#modal-comp-add-child").modal("open");
        // add child when enter key pressed
        d3.select("#modal-comp-add-child form")
            .on("submit", function () {
                addChild();
                $("#modal-comp-add-child").modal("close");
                return false;
            });
        $("#modal-comp-add-child form")[0].reset();  // inputテキストボックスを空にする
        $("#input-comp-add-child").focus();  // テキストボックスにフォーカス
        d3.select("#modal-comp-add-child a")  // behavior when AGREE button clicked
            .on("click", addChild);
    });
    // Sortable List Option for Children
    if ("compChildrenSort" in window) { compChildrenSort.destroy(); }
    var el = document.getElementById("comp-children");
    compChildrenSort = Sortable.create(el, {
        animation: 100,
        draggable: ".collection-item.drag",
        filter: ".js-remove",
        onFilter: function (evt) {
            var item = evt.item;
            var ctrl = evt.target;
            if (Sortable.utils.is(ctrl, ".js-remove")) {  // Click on remove button
                var _del = function () {
                    item.parentNode.removeChild(item); // remove sortable item
                    // 子Nodeの削除
                    node.data.children.splice(evt.oldIndex - 1, 1);
                    // 子Node削除によりjson pointerが繰り上がる
                    var _jptr = node == root ? "" : getJptr(node);
                    _jptr += "/children/" + String(evt.oldIndex - 1);
                    delJptr(_jptr, root)
                    trees.reload();
                    clickCompNode(parseJptr(root, getJptr(node)), i, a, root)
                }
                confirmDelNode(node.data.children[evt.oldIndex - 1].name, _del);
            }
        },
        // drag後の処理
        onUpdate: function (evt) {
            var _old = evt.oldIndex;
            var _new = evt.newIndex;
            var _jptr = node == root ? "" : getJptr(node);
            var _jptr_old = _jptr + "/children/" + (_old - 1);
            var _jptr_new = _jptr + "/children/" + (_new - 1);
            // temporary variable of child element of evt.oldIndex
            var _t = node.data.children[_old - 1];
            // old <- new
            node.data.children[_old - 1] = node.data.children[_new - 1];
            // new <- old
            node.data.children[_new - 1] = _t;
            // swap json pointer indicating parent of func-, param-node
            swapJptr(node, _jptr_old, _jptr_new);
            // データ再構築
            var _jptr = getJptr(node);
            trees.reload();
            clickCompNode(parseJptr(root, _jptr), i, a, root);
        }
    });

    // bind func-nodes
    var func = d3.select("#comp-func")
        .selectAll("li.collection-item")
        .data(function () { return node.func ? node.func : []; });
    func.exit().remove();
    var enteredFunc = func.enter()
        .append("li");
    var updatedFunc = enteredFunc.merge(func)
        .attr("class", "collection-item drag")
        .text(function (d) { return d.data.name; });
    // add remove button for func-Node
    updatedFunc.call(addRemoveIcon);
    // insert add-func-node button
    var addFuncBtn = d3.select("#comp-func")
        .append("li").attr("class", "collection-item add")
        .append("button").attr("class", "waves-effect waves-light btn");
    addFuncBtn.text("Add")
        .append("i").attr("class", "material-icons left")
        .text("add");
    // behavior when add-func-node button is clicked 
    var addFunc = function () {
        var _name = $("#input-comp-add-func").val();
        var newObj = makeNewFunc(_name);
        if (node.data.func === undefined) {
            node.data["func"] = [];
        }
        node.data.func.push(newObj);
        var _jptr = getJptr(node);
        trees.reload();
        clickCompNode(parseJptr(root, _jptr), i, a, root);
    }
    addFuncBtn.on("click", function () {
        $("#modal-comp-add-func").modal("open");
        // add func-node when enter key pressed
        d3.select("#modal-comp-add-func form")
            .on("submit", function () {
                addFunc();
                $("#modal-comp-add-func").modal("close");
                return false;
            });
        $("#modal-comp-add-func form")[0].reset();  // inputテキストボックスを空にする
        $("#input-comp-add-func").focus();  // テキストボックスにフォーカス
        d3.select("#modal-comp-add-func a")  // behavior when AGREE button clicked
            .on("click", addFunc);
    });
    // func-Node のSortable設定
    if ("compFuncSort" in window) { compFuncSort.destroy(); }
    var el_func = document.getElementById("comp-func");
    compFuncSort = Sortable.create(el_func, {
        animation: 100,
        draggable: ".collection-item.drag",
        filter: ".js-remove",
        onFilter: function (evt) {
            var item = evt.item;
            var ctrl = evt.target;
            if (Sortable.utils.is(ctrl, ".js-remove")) {  // Click on remove button
                var _del = function () {
                    item.parentNode.removeChild(item); // remove sortable item
                    // dataから削除
                    node.data.func.splice(evt.oldIndex - 1, 1);
                    // 削除したfunc-nodeを親としているjson pointerを削除
                    var _jptr = getJptr(node) + "/func/" + String(evt.oldIndex - 1);
                    delJptr(_jptr, root);
                    // データ再構築
                    var _jptr = getJptr(node);
                    trees.reload();
                    clickCompNode(parseJptr(root, _jptr), i, a, root);
                }
                confirmDelNode(node.data.func[evt.oldIndex - 1].name, _del);
            }
        },
        // drag後の処理
        onUpdate: function (evt) {
            var _old = evt.oldIndex;
            var _new = evt.newIndex;
            var _jptr = node == root ? "" : getJptr(node);
            var _jptr_old = _jptr + "/func/" + (_old - 1);
            var _jptr_new = _jptr + "/func/" + (_new - 1);
            // temporary variable for func-node element of evt.oldIndex
            var _t = node.data.func[_old - 1];
            // old <- new
            node.data.func[_old - 1] = node.data.func[_new - 1];
            // new <- old
            node.data.func[_new - 1] = _t;
            // swap
            swapJptr(node, _jptr_old, _jptr_new);
            // データ再構築
            var _jptr = getJptr(node);
            trees.reload();
            clickCompNode(parseJptr(root, _jptr), i, a, root);
        }
    });

    // bind param-node 
    var param = d3.select("#comp-param")
        .selectAll("li.collection-item")
        .data(function () { return node.param ? node.param : []; });
    param.exit().remove();
    var enteredParam = param.enter()
        .append("li");
    var updatedParam = enteredParam.merge(param)
        .attr("class", "collection-item drag")
        .text(function (d) { return d.data.name; });
    // add remove button for param-Node
    updatedParam.call(addRemoveIcon);
    // insert add-param-node button
    var addParamBtn = d3.select("#comp-param")
        .append("li").attr("class", "collection-item add")
        .append("button").attr("class", "waves-effect waves-light btn");
    addParamBtn.text("Add")
        .append("i").attr("class", "material-icons left")
        .text("add");
    // behavior when add-param-node button is clicked 
    var addParam = function () {
        var _name = $("#input-comp-add-param").val();
        var newObj = makeNewParam(_name);
        if (node.data.param === undefined) {
            node.data["param"] = [];
        }
        node.data.param.push(newObj);
        var _jptr = getJptr(node);
        trees.reload();
        clickCompNode(parseJptr(root, _jptr), i, a, root);
    }
    addParamBtn.on("click", function () {
        $("#modal-comp-add-param").modal("open");
        // add param-node when enter key pressed
        d3.select("#modal-comp-add-param form")
            .on("submit", function () {
                addParam();
                $("#modal-comp-add-param").modal("close");
                return false;
            });
        $("#modal-comp-add-param form")[0].reset();  // inputテキストボックスを空にする
        $("#input-comp-add-param").focus();  // テキストボックスにフォーカス
        d3.select("#modal-comp-add-param a")  // behavior when AGREE button clicked
            .on("click", addParam);
    });
    // Sortable list option for param of component
    if ("compParamSort" in window) { compParamSort.destroy(); }
    var el_param = document.getElementById("comp-param");
    compParamSort = Sortable.create(el_param, {
        animation: 100,
        draggable: ".collection-item.drag",
        filter: ".js-remove",
        onFilter: function (evt) {
            var item = evt.item;
            var ctrl = evt.target;
            if (Sortable.utils.is(ctrl, ".js-remove")) {  // Click on remove button
                var _del = function () {
                    item.parentNode.removeChild(item); // remove sortable item
                    // dataから削除
                    node.data.param.splice(evt.oldIndex - 1, 1);
                    // データ再構築
                    var _jptr = getJptr(node);
                    trees.reload();
                    clickCompNode(parseJptr(root, _jptr), i, a, root);
                }
                confirmDelNode(node.data.param[evt.oldIndex - 1].name, _del);
            }
        },
        // drag後の処理
        onUpdate: function (evt) {
            var _old = evt.oldIndex;
            var _new = evt.newIndex;
            // temporary variable for func-node element of evt.oldIndex
            var _t = node.data.param[_old - 1];
            // old <- new
            node.data.param[_old - 1] = node.data.param[_new - 1];
            // new <- old
            node.data.param[_new - 1] = _t;
            // データ再構築
            var _jptr = getJptr(node);
            trees.reload();
            clickCompNode(parseJptr(root, _jptr), i, a, root);
        }
    });
    // bind note
    d3.select("#comp-edit").select(".note textarea")
        .call(bindNote, node, a[i]);
}

// func-nodeクリック時の挙動
function clickFuncNode(node, i, a) {
    console.log(node);

    setEditPane("func");
    highlightNode(node);

    // bind name
    d3.select("#func-edit .node-name form")
        .call(bindName, node);
    // bind category
    d3.select("#func-edit .category")
        .call(bindCategory, node, a[i], "func");
    // bind comp-node which func is solved by (isb)
    var isb = d3.select("#func-isb")
        .selectAll("li.collection-item")
        .data(function () { return node.isb ? [node.isb] : []; });
    isb.exit().remove();
    var enteredIsb = isb.enter()
        .append("li");
    var updatedIsb = enteredIsb.merge(isb)
        .attr("class", "collection-item")
        .text(function (d) { return d.data.name; });

    // bind parent
    d3.select("#func-parents .add")
        .remove();  // 以前に作成したaddボタンを削除
    var prnt = d3.select("#func-parents")
        .selectAll("li.collection-item")
        .data(function () { return node.parents ? node.parents : []; });
    prnt.exit().remove();  // 減った要素を削除
    var enteredPrnt = prnt.enter()  // 増えた要素を追加
        .append("li")
    var updatedPrnt = enteredPrnt.merge(prnt)  // 内容更新
        .attr("class", "collection-item drag")
        .text(function (d) { return d === null ? "no parent" : d.data.name; });
    // add remove button to each parent
    updatedPrnt.call(addRemoveIcon);
    // insert add-parent button
    var addParentBtn = d3.select("#func-parents")
        .append("li").attr("class", "collection-item add")
        .append("button").attr("class", "waves-effect waves-light btn");
    addParentBtn.text("Add")
        .append("i").attr("class", "material-icons left")
        .text("add");
    // behavior when add-parent button is clicked 
    addParentBtn.on("click", function () {
        // 選択されているfuncとisb関係にあるcomp-nodeのancestorにあるfuncを探索
        var addiable = node.isb.ancestors()
            .reduce(function (pre, _node) {
                return pre.concat(_node.func);
            }, Array())
            .filter(function (elm) {
                if (elm == node || node.parents.indexOf(elm) != -1) {
                    return false;
                }
                return true;
            })
        var prnt = d3.select("#add-func-parent")
            .selectAll("a.collection-item")
            .data(addiable);
        prnt.exit().remove();
        var enteredPrnt = prnt.enter()
            .append("a")
            .attr("href", "#!")
            .attr("class", "collection-item");
        enteredPrnt.append("div")
            .attr("class", "side-prnt-name");
        enteredPrnt.append("div")
            .attr("class", "side-prnt-isb");
        var margedPrnt = enteredPrnt.merge(prnt);
        // show addiable func-node
        margedPrnt.select(".side-prnt-name")
            .text(function (d) {
                return d.data.name;
            })
        margedPrnt.select(".side-prnt-isb")
            .text(function (d) {
                return d.isb.data.name;
            });
        // click時の挙動
        margedPrnt.on("click", function (prnt) {
            var _ptr = getJptr(prnt.isb,
                "/func/" + prnt.isb.func.indexOf(prnt));
            node.data.parents.push(_ptr);
            // データ再構築
            $("#side-add-func-parent").sideNav("hide");
            var _jptr = getJptr(node.isb,
                "/func/" + node.isb.func.indexOf(node));
            trees.reload();
            // clickFuncNode(parseJptr(root, _jptr), i, a);
        });
        $("#side-add-func-parent").sideNav("show");
    });
    // Sortable List Option for parents of function
    if ("funcParentsSort" in window) { funcParentsSort.destroy(); }
    var el = document.getElementById("func-parents");
    funcParentsSort = Sortable.create(el, {
        animation: 100,
        draggable: ".collection-item.drag",
        filter: ".js-remove",
        onFilter: function (evt) {
            var item = evt.item;
            var ctrl = evt.target;
            if (Sortable.utils.is(ctrl, ".js-remove")) {  // Click on remove button
                item.parentNode.removeChild(item); // remove sortable item
                // 子要素の削除
                node.data.parents.splice(evt.oldIndex - 1, 1);
                trees.reload();
            }
        },
        // drag後の処理
        onUpdate: function (evt) {
            var _old = evt.oldIndex;
            var _new = evt.newIndex;
            var _oldPrnt = node.data.parents[_old - 1];
            node.data.parents[_old - 1] = node.data.parents[_new - 1];
            node.data.parents[_new - 1] = _oldPrnt;
            // データ再構築
            trees.reload();
        }
    });

    var cldrn = d3.select("#func-children")
        .selectAll("li.collection-item")
        .data(function () { return node.children ? node.children : []; });
    cldrn.exit().remove();
    var enteredCldrn = cldrn.enter()
        .append("li");
    enteredCldrn.merge(cldrn)
        .attr("class", "collection-item drag")
        .text(function (d) { return d.data.name; });

    // bind note
    d3.select("#func-edit").select(".note textarea")
        .call(bindNote, node, a[i]);
}

// param-nodeクリック時の挙動
function clickParamNode(node, i, a) {
    console.log(node);

    setEditPane("param")
    highlightNode(node);

    // bind definition of parameter
    d3.select("#param-edit .node-name form")
        .call(bindName, node);
    // bind category
    d3.select("#param-edit .category")
        .call(bindCategory, node, a[i], "param");
    // bind comp-node which parameter is constrained by (icb)
    var icb = d3.select("#param-icb")
        .selectAll("li.collection-item")
        .data(function () { return node.icb ? [node.icb] : []; });
    icb.exit().remove();
    var enteredIcb = icb.enter()
        .append("li");
    var updatedIcb = enteredIcb.merge(icb)
        .attr("class", "collection-item")
        .text(function (d) { return d.data.name; });

    // bind parent
    d3.select("#param-parents .add")
        .remove();  // 以前に作成したaddボタンを削除
    var prnt = d3.select("#param-parents")
        .selectAll("li.collection-item")
        .data(function () { return node.parents ? node.parents : []; });
    prnt.exit().remove();  // 減った要素を削除
    var enteredPrnt = prnt.enter()  // 増えた要素を追加
        .append("li")
    var updatedPrnt = enteredPrnt.merge(prnt)  // 内容更新
        .attr("class", "collection-item drag")
        .text(function (d) { return d === null ? "no parent" : d.data.name; });
    // add remove button to each parent
    updatedPrnt.call(addRemoveIcon);
    // insert add-parent button
    var addParentBtn = d3.select("#param-parents")
        .append("li").attr("class", "collection-item add")
        .append("button").attr("class", "waves-effect waves-light btn");
    addParentBtn.text("Add")
        .append("i").attr("class", "material-icons left")
        .text("add");
    // behavior when add-parent button is clicked 
    addParentBtn.on("click", function () {
        // 選択されているparamとicb関係にあるcomp-nodeのancestorにあるfuncを探索
        var addiable = node.icb.ancestors()
            .reduce(function (pre, _node) {
                return pre.concat(_node.func);
            }, Array())
            .filter(function (elm) {
                if (elm == node || node.parents.indexOf(elm) != -1) {
                    return false;
                }
                return true;
            })
        var prnt = d3.select("#add-param-parent")
            .selectAll("a.collection-item")
            .data(addiable);
        prnt.exit().remove();
        var enteredPrnt = prnt.enter()
            .append("a")
            .attr("href", "#!")
            .attr("class", "collection-item");
        enteredPrnt.append("div")
            .attr("class", "side-prnt-name");
        enteredPrnt.append("div")
            .attr("class", "side-prnt-isb");
        var margedPrnt = enteredPrnt.merge(prnt);
        // show addiable func-node
        margedPrnt.select(".side-prnt-name")
            .text(function (d) {
                return d.data.name;
            })
        margedPrnt.select(".side-prnt-isb")
            .text(function (d) {
                return d.isb.data.name;
            });
        // click時の挙動
        margedPrnt.on("click", function (prnt) {
            var prntPtr = getJptr(prnt.isb,
                "/func/" + prnt.isb.func.indexOf(prnt));
            node.data.parents.push(prntPtr);
            // データ再構築
            $("#side-func-parent").sideNav("hide");
            var thisPtr = getJptr(node.icb,
                "/param/" + node.icb.param.indexOf(node));
            trees.reload();
            // clickParamNode(parseJptr(root, thisPtr), i, a);
        });
        $("#side-add-param-parent").sideNav("show");
    });
    // Sortable List Option for parents of parameter
    if ("paramParentsSort" in window) { paramParentsSort.destroy(); }
    var el = document.getElementById("param-parents");
    paramParentsSort = Sortable.create(el, {
        animation: 100,
        draggable: ".collection-item.drag",
        filter: ".js-remove",
        onFilter: function (evt) {
            var item = evt.item;
            var ctrl = evt.target;
            if (Sortable.utils.is(ctrl, ".js-remove")) {  // Click on remove button
                item.parentNode.removeChild(item); // remove sortable item
                // 子要素の削除
                node.data.parents.splice(evt.oldIndex - 1, 1);
                trees.reload();
            }
        },
        // drag後の処理
        onUpdate: function (evt) {
            var _old = evt.oldIndex;
            var _new = evt.newIndex;
            var _oldPrnt = node.data.parents[_old - 1];
            node.data.parents[_old - 1] = node.data.parents[_new - 1];
            node.data.parents[_new - 1] = _oldPrnt;
            // データ再構築
            trees.reload();
        }
    });

    // bind note
    d3.select("#param-edit").select(".note textarea")
        .call(bindNote, node, a[i]);
}

function getFMNodeHeight() {
    return 15;
}
function getFMNodeWidth() {
    return 150;
}
function getFMLabelWidth() {
    return getFMNodeWidth() - 20;
}

// create dictionary of new component node
function makeNewComp(name) {
    var dic = {};
    dic["name"] = name;
    dic["cat"] = "";
    dic["func"] = [];
    dic["param"] = [];
    dic["children"] = [];
    dic["note"] = "";
    return dic;
}

// create dictionary of new function node
function makeNewFunc(name) {
    var dic = {};
    dic["name"] = name;
    dic["cat"] = "";
    dic["parents"] = [];
    dic["note"] = "";
    return dic;
}

// create dictionary of new parameter node
function makeNewParam(name) {
    var dic = {};
    dic["name"] = name;
    dic["cat"] = "";
    dic["parents"] = [];
    dic["note"] = "";
    return dic;
}

// get json-pointer of the node
function getJptr(node, ptr = "") {
    if (node.parent === null) {
        return ptr;
    } else {
        var _ref = node.parent.children.indexOf(node);
        var _ptr = ptr === "" ? "" : ptr;
        return getJptr(node.parent, "/children/" + _ref + _ptr);
    }
}

// delete json pointer
// jptr: json pointer to delete
// node: root node for searching json pointer
function delJptr(jptr, node) {
    var argIndex = jptr.match(/\d+$/)[0];  // indexを切り出し
    var jptrLeft = jptr.slice(0, -argIndex.length);
    var re = RegExp("^" + jptrLeft)
    var _del = function (prnts) {
        var index = prnts.length - 1;
        while (index >= 0) {
            // 引数のjptrと、data中のjptrのindexを比較
            var _right = prnts[index].split(re)[1];
            if (_right !== undefined) {
                var jptrIndex = _right.match(/^\d+/)[0];  // each要素のindex
                var jptrRight = _right.split(/^\d+/)[1];  // each要素のindex以降のjptr文字列
                if (jptrIndex == argIndex) {
                    prnts.splice(index, 1);
                }
                // 削除したindexより後の要素を繰り上げ
                else if (Number(jptrIndex) > Number(argIndex)) {
                    var newNum = Number(jptrIndex) - 1;
                    prnts[index] = jptrLeft + String(newNum) + jptrRight;
                }
            }
            index--;
        }
    }
    node.descendants().forEach(function (d) {
        d.data.func.forEach(function (f) {
            _del(f.parents);
        })
        d.data.param.forEach(function (p) {
            _del(p.parents);
        })
    });
}
// swap json pointer
function swapJptr(node, oldJptr, newJptr) {
    var oldRe = RegExp("^" + oldJptr);
    var newRe = RegExp("^" + newJptr);
    var _replace = function (str) {
        var replaced = str.replace(oldRe, newJptr);
        if (replaced != str) {
            return replaced;
        }
        else {
            replaced = str.replace(newRe, oldJptr);
            if (replaced != str) {
                return replaced;
            } else {
                return false;
            }
        }
    }
    node.descendants().forEach(function (d) {
        // swap func-parent json pointer
        d.data.func.forEach(function (f) {
            f.parents.forEach(function (ptr, i, arr) {
                var replaced = _replace(ptr);
                if (replaced != false) {
                    arr[i] = replaced;
                }
            })
        })
        // swap param-parent json pointer
        d.data.param.forEach(function (p) {
            p.parents.forEach(function (ptr, i, arr) {
                var replaced = _replace(ptr);
                if (replaced != false) {
                    arr[i] = replaced;
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

// set edit pane
// arg: str type: "comp", "func", "param"
// if argument is not given, edit pane is cleared.
function setEditPane(type = undefined) {
    highlightNode();
    if (type === "comp") {
        d3.select("#comp-edit")
            .style("display", "block");
    } else {
        d3.select("#comp-edit")
            .style("display", "none");
    }
    if (type === "func") {
        d3.select("#func-edit")
            .style("display", "block");
    } else {
        d3.select("#func-edit")
            .style("display", "none");
    }
    if (type === "param") {
        d3.select("#param-edit")
            .style("display", "block");
    } else {
        d3.select("#param-edit")
            .style("display", "none");
    }
}

// confirm before delete node
function confirmDelNode(name, f, anotherText = undefined) {
    $("#modal-remove-confirm .modal-content h4")
        .text(function () {
            if (anotherText) {
                return anotherText;
            } else {
                return 'Are you sure you want to delete "' + name + '"';
            }
        });
    $("#modal-remove-confirm").modal("open");
    d3.select("#modal-remove-confirm a")
        .on("click", f)
}


// show background fill of selected node in svg
function highlightNode(node) {
    d3.select("#compTreeSVG .highlight")
        .selectAll("rect").remove();
    if (node === undefined) { return; }
    d3.select("#compTreeSVG .highlight")
        .attr("transform", "translate(" + node.y + "," + node.x + ")")
        .append("rect")
        .attr("x", 0).attr("y", -5).attr("width", 120).attr("height", 10)
        .attr("fill", "#64ffda");
}

// treeのseparater カリー化
function separate(getSub, a, b) {
    return function (a, b) {
        var sep = 2;  // space between nodes
        // root of node a/b
        var _root = a.ancestors()
            .filter(function (d) { return d.depth === 0; })[0];

        // comp-, func-, parm-nodeのラベル幅を求める(子ノードは考慮しない)
        var getWidth = function (node) {
            var width = 0;
            width += node.label.length;
            getSub(node).forEach(function (f) {
                width += f.label.length;
            })
            return width;
        }

        // 共通の親ノードまで遡ってノード幅広さを拡張する
        // return { "node": node, "width": _width }
        var widenForward = function (node, root, width = undefined) {
            var _width;
            if (width === undefined) {
                _width = getWidthOneBack(node);
            } else {
                _width = width;
            }
            if (node.parent == root || node == root) {
                return { "node": node, "width": _width };
            } else {
                // 同じ親に属するノードのうち、引数ノードより上側のノードの幅を加算
                for (var i = 0; i < node.parent.children.indexOf(node); i++) {
                    _width[0] += getWidthOneBack(node.parent.children[i])[1]
                        + getWidthOneBack(node.parent.children[i])[1]
                        + sep;
                }
                // 同じ親に属するノードのうち、引数ノードより下側のノードの幅を加算
                for (var i = node.parent.children.indexOf(node) + 1; i < node.parent.children.length; i++) {
                    _width[1] += getWidthOneBack(node.parent.children[i])[0]
                        + getWidthOneBack(node.parent.children[i])[1]
                        + sep;
                }
                return widenForward(node.parent, root, _width);
            }
        };
        // treeの子nodeを下ってノード幅広さを拡張する
        // 戻り値: 幅のarray, index 0: 上側の余白, index 1: 下側の余白
        var widenBackward = function (node, depth = undefined) {
            var _getChildrenWidth = function (node, depth) {
                var childrenWidth = 0;
                if ((depth != undefined || depth >= 0) && node.children != undefined) {
                    var childrenWidth = node.children
                        .reduce(function (_a, _b) {
                            var _child = _getChildrenWidth(_b, depth - 1);
                            var _this = getWidth(_b);
                            var _width = _this > _child ? _this : _child;
                            return _a + _width + sep;
                        }, 0);
                }
                return childrenWidth;
            }
            var childrenWidth = _getChildrenWidth(node);
            var thisWidth = getWidth(node);
            var _result = Array();  //index 0: 上側の余白, index 1: 下側の余白
            _result[0] = childrenWidth / 2;
            _result[1] = thisWidth > childrenWidth / 2 ? thisWidth : childrenWidth / 2;
            return _result;
        }
        // ノードの幅広さを求める関数
        // 戻り値: 幅のarray, index 0: 上側の余白, index 1: 下側の余白
        var getWidthOneBack = function (node) {
            return widenBackward(node, 1);
        };

        if (a.parent == b.parent) {
            var a_i = a.parent.children.indexOf(a);
            var b_i = b.parent.children.indexOf(b);
            var begin = a_i > b_i ? b_i : a_i;
            var end = a_i > b_i ? a_i : b_i;
            var _result = getWidthOneBack(a.parent.children[begin])[1] + sep;
            for (var i = begin + 1; i < end; i++) {
                _result += getWidthOneBack(a.parent.children[i])[0]
                    + getWidthOneBack(a.parent.children[i])[1] + sep;
            }
            _result += getWidthOneBack(a.parent.children[end])[0];
            return _result;
        }
        else {
            var jptrA = getJptr(a);
            var jptrB = getJptr(b);
            var jptrIndex = 0;
            do {
                if (jptrA[jptrIndex] != jptrB[jptrIndex]) {
                    if (jptrA[jptrIndex] == "/") {
                        // aとbが親子関係の場合: jptrは"/"の有無で違いが発生
                    } else {
                        // aとbが兄弟関係の場合: jptrは数字が異なる
                        // 共通の親ノードのjson pointerを得る
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
            var rootAandB = parseJptr(_root, jptrA.substring(0, jptrIndex))

            // jptrAとjptrBを共通の親ノードまで遡る
            var widenA = widenForward(a, rootAandB);
            var widenB = widenForward(b, rootAandB);
            // aとbが親子関係の場合
            if (widenA.node == rootAandB || widenB.node == rootAandB) {
                var _prnt;
                var _child;
                if (widenA.node == rootAandB) {
                    _prnt = widenA;
                    _child = widenB;
                } else {
                    _prnt = widenB;
                    _child = widenA;
                }
                var _wholeWidth = 0;  // 子全体の幅
                var _targetWidth = 0;  // _childまでの幅
                var _index = _prnt.node.children.indexOf(_child.node);
                _prnt.node.children.forEach(function (ch, i, arr) {
                    var _childWidth = widenBackward(ch);
                    if (i == arr.length) {
                        _wholeWidth += _childWidth[0];
                    } else {
                        _wholeWidth += _childWidth[0] + _childWidth[1] + sep;
                    }
                    if (_index < i) {
                        _targetWidth += _childWidth[0] + _childWidth[1] + sep;
                    } else if (_index == i) {
                        _targetWidth += _childWidth[0];
                    }
                });
                return Math.abs(_wholeWidth / 2 - _targetWidth);
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
                    _result += getWidthOneBack(widenA.node.parent.children[i])[1] + sep;
                }
            }
            return _result;
        }
    }
};

// bind category
// use from d3.select.call()
// selection: "category"-classed <ul> element
// type: what is editting in pane (comp / func / param)
function bindCategory(selection, node, svgNode, type) {
    var catList = ["uncategolized"];
    if (category[type]) {
        catList = catList.concat(category[type]);
    }
    var selElm = selection.select("select");
    var cat = selElm.selectAll("option")
        .data(catList);
    cat.exit().remove();
    var enteredCat = cat.enter()
        .append("option");
    enteredCat.merge(cat)
        .attr("value", function (d) { return catList.indexOf(d); })
        .text(function (d) { return d; });
    // set category which has already set on the selected node
    selElm.property("value", function () {
        return catList.indexOf(node.data.cat);
    });
    // change category
    $(selElm.node()).off("change");
    $(selElm.node()).on("change", function () {
        if (selElm.property("value") != 0) {
            node.data.cat = catList[selElm.property("value")];
        } else {
            node.data.cat = "";
        }
        d3.select(svgNode).call(styleNode);
    });
    // update materialize select forms
    $("select").material_select();
    // category edit button
    selection.select(".btn-edit-cat")
        .on("click", function () {
            $("#modal-category").modal("open");
            updateCatSettings(function () {
                bindCategory(selection, node, svgNode, type);
            });
        })
}

// update category settings modal content
function updateCatSettings(updateEditPane) {
    if (!("sort" in window)) {
        sort = {}
    };
    var _update = function (id, type) {
        // reset add category form
        $("#" + id + " .add_cat form")[0].reset();

        if (!category[type]) {
            category[type] = [];
        }

        var cat = d3.select("#" + id).select("ul")
            .selectAll("li.collection-item")
            .data(category[type]);
        cat.exit().remove();
        var enteredCat = cat.enter()
            .append("li");
        enteredCat.append("div")
            .attr("onsubmit", "return false;")
            .attr("class", "input-field");
        enteredCat.select("div")
            .append("i").attr("class", "material-icons prefix");
        enteredCat.select("div")
            .append("input");
        // remove icon
        enteredCat.call(addRemoveIcon);
        var updatedCat = enteredCat.merge(cat)
            .attr("class", "collection-item drag");
        // category color mark
        updatedCat.select("i")
            .style("color", function (d) { return getCatColor(d, type) })
            .text("crop_square");
        // category name
        updatedCat.select("input")
            .property("value", function (d) { return d; });
        // change category name
        updatedCat.select("input")
            .on("change", function (d) {
                swapCategory(type, d, d3.event.target.value);
                _update(id, type);
                updateEditPane();
            });
        function swapCategory(type, oldStr, newStr) {
            category[type][category[type].indexOf(oldStr)] = newStr;
            var des = {
                "comp": root.descendants(),
                "func": root.funcDescendants(),
                "param": root.paramDescendants()
            }
            des = des[type];
            des.forEach(function (d) {
                if (d.data.cat == oldStr) {
                    d.data.cat = newStr;
                }
            })
        };
        // set RegExp pattern in <input> for validation
        // inhibit to input already registered name
        d3.select("#" + id + " .add_cat input")
            .attr("pattern", function () {
                var re;
                if (category[type].length != 0) {
                    re = "^(?!";
                    re += category[type].reduce(function (a, b) {
                        if (a === "") {
                            return b;
                        }
                        else {
                            return a + "|" + b;
                        }
                    }, "")
                    re += ").*$"
                }
                else {
                    re = ".*"
                }
                return re;
            });
        // add category
        d3.select("#" + id + " .add_cat form")
            .on("submit", function () {
                var addInput = d3.select("#" + id + " .add_cat input");
                var newCat = addInput.property("value");
                category[type].push(newCat);
                _update(id, type);
                updateEditPane();
            })
        // sortable.js option
        if (sort[id]) {
            sort[id].destroy();
        }
        var list = $("#" + id + " ul").get(0);
        sort[id] = Sortable.create(list, {
            animation: 100,
            draggable: ".collection-item.drag",
            onUpdate: function (evt) {  // behavior on drag
                var _ = category[type][evt.oldIndex - 1];
                category[type][evt.oldIndex - 1] = category[type][evt.newIndex - 1];
                category[type][evt.newIndex - 1] = _;
                _update(id, type);
                updateEditPane();
                d3.select("#comp-tree").selectAll("." + type + "Node")
                    .call(styleNode);
            },
            // remove item
            filter: ".js-remove",
            onFilter: function (evt) {
                if (Sortable.utils.is(evt.target, ".js-remove")) {  // Click on remove button
                    var _del = function () {
                        var item = evt.item;
                        item.parentNode.removeChild(item); // remove sortable item
                        // datasetから削除
                        category[type].splice(evt.oldIndex - 1, 1);
                        _update(id, type);
                        updateEditPane();
                        d3.select("#comp-tree").selectAll("." + type + "Node")
                            .call(styleNode);
                    }
                    confirmDelNode(category[type][evt.oldIndex - 1], _del);
                }
            }
        });
    }
    _update("cat-set-comp", "comp");
    _update("cat-set-func", "func");
    _update("cat-set-param", "param");
}

// set style of node in SVG
// use from d3.select.call()
function styleNode(selection) {
    // 要素がないselectionでもcallで関数呼ばれるので、エラー回避のために要素数判定してreturn
    if (selection._groups[0].length === 0) {
        return;
    }
    var nodeType = selection.attr("class")
        .split(" ").filter(function (e) {
            return /.*Node$/.test(e);
        });;
    var type = nodeType[0].substr(0, nodeType[0].length - 4);
    var fontSize = {
        "comp": getNodeHeight() + "px",
        "func": getNodeHeight() * 0.9 + "px",
        "param": getNodeHeight() * 0.9 + "px"
    }
    var fontColor = {
        "comp": "black",
        "func": "dimgray",
        "param": "dimgray"
    }
    var baseline = {
        "comp": "auto",
        "func": "central",
        "param": "central"
    }
    selection.select("text")
        .attr("fill", fontColor[type])
        .attr("stroke", function (d) {
            return getCatColor(d.data.cat, type);
        })
        .attr("stroke-width", "0.7px")
        .attr("dominant-baseline", baseline[type]);

    // add tooltip displaying note
    selection.classed("note-tooltip", function (d, i, a) {
        if (d.data.note) {
            $(a[i]).tooltip({ tooltip: d.data.note, delay: 50, position: "left" });
            return true;
        } else {
            if (d3.select(this).classed("note-tooltip")) {
                $(a[i]).tooltip("remove");
            }
            return false;
        }
    });
}

// get category color
// catStr: category name string, type: comp/func/paraam
function getCatColor(catStr, type) {
    if (!category[type]) {
        category[type] = [];
    }
    var index = category[type].indexOf(catStr);
    if (index == -1) {
        return undefined;
    }
    index = index % 10;
    var cat20bc = d3.schemeCategory20b.concat(d3.schemeCategory20c);
    if (type == "comp") {
        return d3.schemeCategory10[index];
    } else if (type == "func") {
        return cat20bc[index * 4];
    } else if (type == "param") {
        return cat20bc[index * 4 + 2];
    } else {
        return undefined;
    }
}

function bindNote(selection, node, svgNode) {
    var _note = "";
    if (node.data.note) {
        _note = node.data.note;
    } else {
        node.data.note = "";
    }
    selection.property("value", _note);
    $(selection.node()).trigger("autoresize");
    // save data if editted
    selection.on("change", function () {
        node.data.note = selection.property("value");
        d3.select(svgNode).call(styleNode);
    })
}

// selection: d3-selector for <form>
function bindName(selection, node) {
    $(selection.node())[0].reset();
    selection.select("input")
        .attr("value", node.data.name)
        .on("change", function () {
            node.data.name = d3.event.target.value;
            trees.reload();
        });
}

// add suffix remove icon for collection-item
// selection: d3-selector for "collection-item" classed <li> element
function addRemoveIcon(selection) {
    selection.append("span").attr("class", "suffix")
        .append("i")
        .attr("class", "js-remove material-icons")
        .text("remove_circle_outline");
}