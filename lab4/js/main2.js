let selectedNode = null;
let selectedLink = null; //{sourceName: null, targetName: null};
const networks = {};
const datasets = {};
const state = {
    "filter1": { selectedEpisodes: new Set([1,2,3,4,5,6,7,"all"]), previousSelection: null },
    "filter2": { selectedEpisodes: new Set([1,2,3,4,5,6,7,"all"]), previousSelection: null }
};

Promise.all([
    d3.json("data/starwars-episode-1-interactions-allCharacters.json"),
    d3.json("data/starwars-episode-2-interactions-allCharacters.json"),
    d3.json("data/starwars-episode-3-interactions-allCharacters.json"),
    d3.json("data/starwars-episode-4-interactions-allCharacters.json"),
    d3.json("data/starwars-episode-5-interactions-allCharacters.json"),
    d3.json("data/starwars-episode-6-interactions-allCharacters.json"),
    d3.json("data/starwars-episode-7-interactions-allCharacters.json"),
    d3.json("data/starwars-full-interactions-allCharacters.json")
]).then(data => {
    datasets[1] = data[0];
    datasets[2] = data[1];
    datasets[3] = data[2];
    datasets[4] = data[3];
    datasets[5] = data[4];
    datasets[6] = data[5];
    datasets[7] = data[6];
    datasets["all"] = data[7];

    // set up UI and render initial views
    setupFilterListeners("filter1", "#view1");
    setupFilterListeners("filter2", "#view2");

    setupCheckboxStates("filter1");
    setupCheckboxStates("filter2");

    updateView("#view1", "filter1");
    updateView("#view2", "filter2");

})
.catch(function(error) {
    console.log("Error: loading JSON", error);
});

function aggregateData(episodeSet) {
    // Combine nodes from selected episodes, aggregating their values
    const nodeMap = new Map();
    const linkMap = new Map();
    
    // If "all" is selected, only use the "all" dataset to avoid double-counting
    let episodesToProcess = Array.from(episodeSet);
    if (episodesToProcess.includes("all")) {
        episodesToProcess = ["all"];
    }
    
    episodesToProcess.forEach(ep => {
        if (datasets[ep]) {
            const data = datasets[ep];
            data.nodes.forEach((node, idx) => {
                if (!nodeMap.has(node.name)) {
                    nodeMap.set(node.name, {
                        name: node.name,
                        value: 0,
                        colour: node.colour,
                        episodes: []
                    });
                }
                const existing = nodeMap.get(node.name);
                existing.value += node.value;
                if (!existing.episodes.includes(ep)) {
                    existing.episodes.push(ep);
                }
            });
            
            data.links.forEach(link => {
                // links reference node indices
                const sourceNode = data.nodes[link.source];
                const targetNode = data.nodes[link.target];
                if (!sourceNode || !targetNode) return; // skip malformed/out-of-range
                const sourceName = sourceNode.name;
                const targetName = targetNode.name;
                const linkKey = [sourceName, targetName].sort().join("|");
                if (!linkMap.has(linkKey)) {
                    linkMap.set(linkKey, { source: sourceName, target: targetName, value: 0 });
                }
                linkMap.get(linkKey).value += link.value;
            });
        }
    });
    
    const nodes = Array.from(nodeMap.values());
    const links = Array.from(linkMap.values()).map(l => ({
        source: nodes.find(n => n.name === l.source),
        target: nodes.find(n => n.name === l.target),
        value: l.value
    })).filter(l => l.source && l.target);
    
    return { nodes, links };
}



function highlightNode(nodeName) {
    // Toggle selection
    if (selectedNode === nodeName) {
        selectedNode = null;
    } else {
        selectedNode = nodeName;
    }

    // Update highlighting in both views
    Object.keys(networks).forEach(cID => {
        updateNetworkHighlight(cID);
    });
}

function highlightLink(linkData){
    const key = {
        source: linkData.source.name,
        target: linkData.target.name
    }
    if(selectedLink && selectedLink.source === key.source && selectedLink.target === key.target) {
        selectedLink = null;
    } else {
        selectedLink = key;
    }

    selectedNode = null; // Deselect any selected node when a link is selected

    Object.keys(networks).forEach(cID => {
        updateNetworkHighlight(cID);
    });
}

function createPopup(containerID) {
    const popupId = `popup-${containerID.replace(/^#/, '')}`;
    let popup = document.getElementById(popupId);
    
    if (!popup) {
        popup = document.createElement('div');
        popup.id = popupId;
        popup.style.position = 'absolute';
        popup.style.backgroundColor = 'black';
        popup.style.border = '1px solid yellow';
        popup.style.borderRadius = '4px';
        popup.style.padding = '8px 12px';
        popup.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
        popup.style.pointerEvents = 'none';
        popup.style.zIndex = '100';
        popup.style.fontSize = '12px';
        popup.style.color = 'yellow';
        popup.style.maxWidth = '200px';
        popup.style.display = 'none';
        document.body.appendChild(popup);
    }
    
    return popup;
}

function showPopup(containerID, nodeName, scenes) {
    const popup = createPopup(containerID);
    popup.innerHTML = `<strong>${nodeName.toLowerCase()}</strong><br/>scenes: ${scenes}`;
    
    // Position popup at the selected node
    const network = networks[containerID];
    if (network && selectedNode) {
        const node = network.nodes.find(n => n.name === selectedNode);
        if (node && node.x !== undefined && node.y !== undefined) {
            const svgElement = network.svg.node();
            const svgRect = svgElement.getBoundingClientRect();
            
            // Position popup slightly offset from the node
            
            const popupX = svgRect.left + node.x + 15;
            const popupY = svgRect.top + node.y - 20;
            
            popup.style.left = popupX + 'px';
            popup.style.top = popupY + 'px';
        }
    }
    
    popup.style.display = 'block';
}

function showLinkPopup(containerID, source, target, coAppearances) {
    const popup = createPopup(containerID);

    popup.innerHTML = `
        <strong>${source.toLowerCase()} — ${target.toLowerCase()}</strong><br/>
        Co-appearances: ${coAppearances}
    `;

    const network = networks[containerID];
    if (!network) return;

    const link = network.links.find(l =>
        (l.source.name === source && l.target.name === target) ||
        (l.source.name === target && l.target.name === source)
    );

    if (!link) return;

    const svgRect = network.svg.node().getBoundingClientRect();

    const midX = (link.source.x + link.target.x) / 2;
    const midY = (link.source.y + link.target.y) / 2;

    popup.style.left = svgRect.left + midX + "px";
    popup.style.top = svgRect.top + midY + "px";
    popup.style.display = "block";
}

function hidePopup(containerID) {
    const popupId = `popup-${containerID.replace(/^#/, '')}`;
    const popup = document.getElementById(popupId);
    if (popup) {
        popup.style.display = 'none';
    }
}

function updateNetworkHighlight(containerID) {
    const network = networks[containerID];
    if (!network) return;
    
    const svg = network.svg;
    const nodes = network.nodes;
    const links = network.links;
    
    // Find connected nodes and links if a node is selected
    let connectedNodeNames = new Set();
    let highlightedLinkKeys = new Set();
    
    if (selectedNode) {
        const selectedNodeObj = nodes.find(n => n.name === selectedNode);
        if (selectedNodeObj) {
            connectedNodeNames.add(selectedNode);
            links.forEach(link => {
                if (link.source.name === selectedNode || link.target.name === selectedNode) {
                    // Create a unique key for each link based on source and target names
                    const linkKey = [link.source.name, link.target.name].sort().join("|");
                    highlightedLinkKeys.add(linkKey);
                    connectedNodeNames.add(link.source.name);
                    connectedNodeNames.add(link.target.name);
                }
            });
            
            // Show popup with view-specific scene count
            showPopup(containerID, selectedNode, selectedNodeObj.value);
        } else {
            hidePopup(containerID);
        }
    } else if(selectedLink) {
        const linkKeySelected =
            [selectedLink.source, selectedLink.target]
            .sort()
            .join("|");

        let coAppearances = 0;

        links.forEach(link => {
            const key =
                [link.source.name, link.target.name]
                .sort()
                .join("|");

            if (key === linkKeySelected) {
                coAppearances = link.value;
                connectedNodeNames.add(link.source.name);
                connectedNodeNames.add(link.target.name);
                highlightedLinkKeys.add(key);
            }
        });

        showLinkPopup(
            containerID,
            selectedLink.source,
            selectedLink.target,
            coAppearances
        );
    } else{
        hidePopup(containerID);
    }
    
    // Update circle styling
    svg.selectAll("circle").style("opacity", d => {
        if (!selectedNode && !selectedLink) return 1;
        return connectedNodeNames.has(d.name) ? 1 : 0.2;
    }).style("stroke", d => {
        if (selectedNode && d.name === selectedNode) {
            return "#ff0000";
        }
        if (selectedLink && connectedNodeNames.has(d.name)){
            return "#ff6600";
        }
        return "none";
    }).style("stroke-width", d => {
        if(selectedNode && d.name === selectedNode) {
            return 3;
        }
        if(selectedLink && connectedNodeNames.has(d.name)) {
            return 3;
        }
        return 0;
    });
    
    // Update line styling
    svg.selectAll("line").style("opacity", d => {
        if (!selectedNode && !selectedLink) return 1;
        const linkKey = [d.source.name, d.target.name].sort().join("|");
        return highlightedLinkKeys.has(linkKey) ? 1 : 0.1;
    }).style("stroke-width", d => {
        const linkKey = [d.source.name, d.target.name].sort().join("|");
        return highlightedLinkKeys.has(linkKey) ? 4 : 2;
    }).style("stroke", d => {
        const linkKey = [d.source.name, d.target.name].sort().join("|");
        if (selectedLink && highlightedLinkKeys.has(linkKey)) {
            return "#ff0000";
        }
        if (selectedNode && highlightedLinkKeys.has(linkKey)) {
            return "#ff6600";
        }
        return "rgb(200, 200, 200)";
    });

}

function updateView(containerID, filterClass) {
    const selected = state[filterClass].selectedEpisodes;
    
    // Don't show diagram if no episodes are selected
    if (selected.size === 0) {
        d3.select(containerID).selectAll("svg").remove();
        return;
    }
    
    const { nodes, links } = aggregateData(selected);
    
    // Clear existing svg
    d3.select(containerID).selectAll("svg").remove();
    
    // Recreate network
    createNetwork(nodes, links, containerID, filterClass);
}

function setupFilterListeners(filterClass, containerID) {
    const checkboxes = document.querySelectorAll(`.${filterClass}`);
    
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener("change", (e) => {
            const value = e.target.value;
            const isChecked = e.target.checked;
            
            if (value === "all") {
                if (isChecked) {
                    // Save current selection before disabling
                    state[filterClass].previousSelection = new Set(state[filterClass].selectedEpisodes);
                    state[filterClass].previousSelection.delete("all");
                    
                    // Check all and disable others
                    state[filterClass].selectedEpisodes.clear();
                    state[filterClass].selectedEpisodes.add("all");
                    for (let i = 1; i <= 7; i++) {
                        state[filterClass].selectedEpisodes.add(i);
                    }
                    setupCheckboxStates(filterClass);
                } else {
                    // Restore previous selection
                    state[filterClass].selectedEpisodes.clear();
                    if (state[filterClass].previousSelection && state[filterClass].previousSelection.size > 0) {
                        state[filterClass].previousSelection.forEach(ep => state[filterClass].selectedEpisodes.add(ep));
                    }
                    setupCheckboxStates(filterClass);
                }
            } else {
                if (isChecked) {
                    state[filterClass].selectedEpisodes.add(parseInt(value));
                } else {
                    state[filterClass].selectedEpisodes.delete(parseInt(value));
                }
                state[filterClass].selectedEpisodes.delete("all");
                document.querySelector(`.${filterClass}[value="all"]`).checked = false;
            }
            
            updateView(containerID, filterClass);
        });
    });
}

function setupCheckboxStates(filterClass) {
    const checkboxes = document.querySelectorAll(`.${filterClass}`);
    const selected = state[filterClass].selectedEpisodes;
    
    checkboxes.forEach(cb => {
        if (cb.value === "all") {
            cb.checked = selected.has("all");
            cb.disabled = false;
        } else {
            cb.checked = selected.has(parseInt(cb.value));
            cb.disabled = selected.has("all");
        }
    });
}

function createNetwork(nodes, links, containerID, filterID) {
    if (!nodes || !links) return;
    // get div bounding box to place svg correctly
    const container = d3.select(containerID).node();
    const boundingBox = container.getBoundingClientRect();
    
    const width = boundingBox.width;
    const height = boundingBox.height;
    const margin = 20;
    
    // append svg
    const svg = d3.select(containerID).append("svg").attr("width", width).attr("height", height);

    // create nodes and links
    const link = svg.append("g")
        .selectAll("line")
        .data(links)
        .enter()
        .append("line")
        .attr("stroke", "rgb(225, 225, 225)")
        .attr("stroke-width", 2)
        .style("cursor", "pointer")
        .on("click", (event, d) => {
            event.stopPropagation();
            highlightLink(d);
        })
    
    console.log(`Creating network with ${nodes.length} nodes and ${links.length} links`);
    
    const node = svg.append("g")
        .selectAll("circle")
        .data(nodes)
        .enter()
        .append("circle")
        .attr("r", d => Math.sqrt(d.value)*2)
        .attr("fill", d => d.colour)
        .style("cursor", "pointer")
        .on("click", (event, d) => {
            event.stopPropagation();
            highlightNode(d.name);
        });

    const linkForce = d3.forceLink(links)
        .id(d => d.name)
        .distance(50)

    // create simulation
    const simulation = d3.forceSimulation(nodes)
        .force("link", linkForce)
        .force("charge", d3.forceManyBody().strength(-20))
        .force("center", d3.forceCenter(width/2, height/2))
        .force("collision", d3.forceCollide().radius(function(d){
            return Math.sqrt(d.value)*2
        }));

    // update position every tick
    simulation.on("tick", () => {
        node
            .attr("cx", function(d) {return Math.max(margin, Math.min(width - margin, d.x))})
            .attr("cy", function(d) {return Math.max(margin, Math.min(height - margin, d.y))})
            .call(drag(simulation));

        link
            .attr("x1", d => Math.max(margin, Math.min(width - margin, d.source.x)))
            .attr("y1", d => Math.max(margin, Math.min(height - margin, d.source.y)))
            .attr("x2", d => Math.max(margin, Math.min(width - margin, d.target.x)))
            .attr("y2", d => Math.max(margin, Math.min(height - margin, d.target.y)));
        
        // Update popup position if a node is selected
        if (selectedNode) {
            const selectedNodeObj = nodes.find(n => n.name === selectedNode);
            if (selectedNodeObj && selectedNodeObj.x !== undefined && selectedNodeObj.y !== undefined) {
                const popup = document.getElementById(`popup-${containerID.replace(/^#/, '')}`);
                if (popup && popup.style.display === 'block') {
                    const svgElement = svg.node();
                    const svgRect = svgElement.getBoundingClientRect();
                    const popupX = svgRect.left + selectedNodeObj.x + 15;
                    const popupY = svgRect.top + selectedNodeObj.y - 20;
                    popup.style.left = popupX + 'px';
                    popup.style.top = popupY + 'px';
                }
            }
        }
    });

    networks[containerID] = {
        nodes,
        links,
        svg,
        simulation,
        checkboxClass: filterID
    };
    
    // Apply current highlight state
    updateNetworkHighlight(containerID);
}

function drag(simulation) {
    let width, height, margin;

    function dragStarted(event, d) {
        if (!event.active) {
            simulation.alphaTarget(0.3).restart();
        }
        const svg = d3.select(event.sourceEvent.target.ownerSVGElement);
        width = +svg.attr("width");
        height = +svg.attr("height");
        margin = 20;
        
        d.fx = Math.max(margin, Math.min(width - margin, d.x));
        d.fy = Math.max(margin, Math.min(height - margin, d.y));
    }
    function dragged(event, d) {
        d.fx = Math.max(margin, Math.min(width - margin, event.x));
        d.fy = Math.max(margin, Math.min(height - margin, event.y));
    }
    function dragEnd(event, d) {
        if (!event.active) {
            simulation.alphaTarget(0);
        }
        d.fx = null;
        d.fy = null;
    }
    return d3.drag()
        .on("start", dragStarted)
        .on("drag", dragged)
        .on("end", dragEnd);
}