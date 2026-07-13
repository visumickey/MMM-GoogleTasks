Module.register("MMM-GoogleTasks", {
  // Default module config.
  defaults: {
    listID: "", // List ID (see authenticate.js)
    maxResults: 10,
    showCompleted: false, //set showCompleted and showHidden true
    ordering: "myorder", // Order by due date, title, updated timestamp or by 'my order'
    dateFormat: "MMM Do", // Format to display dates (moment.js formats)
    updateInterval: 10000, // Time between content updates (millisconds)
    animationSpeed: 2000, // Speed of the update animation (milliseconds)
    tableClass: "small", // Name of the classes issued from main.css
    wrapText: false, // Flag to wrap text
    maxWidth: "450px", // Max width of module (e.g. "450px", "100%", "300px", or false)
    boldText: false, // Flag to make task text bold/thicker
    fontWeight: 500, // Font weight for task items (e.g. 400, 500, 600)
    colored: true, // Flag to color bullet icons and brighten task titles
    colorTasks: false, // Set true to give each task item its own vibrant color (like calendar events)
    taskColors: [
      "#4285f4",
      "#f4b400",
      "#0f9d58",
      "#ff7043",
      "#ab47bc",
      "#00acc1",
      "#ec407a"
    ], // Array of vibrant colors for tasks when colorTasks is true
    titleColor: "", // Custom CSS color for task titles (e.g. "#fff", "#4285f4")
    showMoreIndicator: true, // Flag to show indicator when total tasks exceed maxResults
    moreIndicatorFormat: "+{extra} more tasks" // Format string ({extra}, {total}, {displayed})

    // Pointless for a mirror, not currently implemented
    /* 
    dueMax: "2040-07-11T18:30:00.000Z", // RFC 3339 timestamp 
    dueMin: "1970-07-11T18:30:00.000Z", // RFC 3339 timestamp 
    completedMax: "2040-07-11T18:30:00.000Z", //only if showCompleted true (RFC 3339 timestamp)
    completedMin: "1970-07-11T18:30:00.000Z", //only if showCompleted true (RFC 3339 timestamp)
    */
  },

  // Define required scripts
  getScripts: function () {
    return ["moment.js"];
  },

  // Define required scripts.
  getStyles: function () {
    return ["font-awesome.css", "MMM-GoogleTasks.css"];
  },

  // Define start sequence
  start: function () {
    Log.info("Starting module: " + this.name);
    this.tasks;
    this.loaded = false;
    if (!this.config.listID) {
      Log.log("config listID required");
    } else {
      this.sendSocketNotification("MODULE_READY", {});
    }

    // API requies completed config settings if showCompleted
    if (!this.config.showCompleted) {
      // delete this.config.completedMin;
      // delete this.config.completedMax;
    } else {
      this.config.showHidden = true;
    }
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "SERVICE_READY") {
      this.sendSocketNotification("REQUEST_UPDATE", this.config);

      // Create repeating call to node_helper get list.
      // Must make a helper variable to capture "this" at the right scope.
      // See https://github.com/MichMich/MagicMirror/issues/196#issuecomment-211565531
      const self = this;
      setInterval(function () {
        self.sendSocketNotification("REQUEST_UPDATE", self.config);
      }, self.config.updateInterval);

      // Check if payload id matches module id
    } else if (
      notification === "UPDATE_DATA" &&
      payload.id === this.config.listID
    ) {
      // Handle new data
      this.loaded = true;
      this.nextPageToken = payload.nextPageToken;
      if (payload.items) {
        this.tasks = payload.items;
        this.updateDom(this.config.animationSpeed);
      } else {
        this.tasks = null;
        Log.info("No tasks found.");
        this.updateDom(this.config.animationSpeed);
      }
    }
  },

  getDom: function () {
    let wrapper = document.createElement("div");
    wrapper.className = "container ";
    wrapper.className += this.config.tableClass;
    const shouldWrap =
      this.config.wrapText ||
      this.config.textWrap ||
      this.config.wrapTitle ||
      this.config.wrapEvents ||
      this.config.wrap;
    if (shouldWrap) {
      wrapper.className += " wrap-text";
    }

    const shouldBold =
      this.config.boldText ||
      this.config.textBold ||
      this.config.bold ||
      this.config.fontWeight === "bold";
    if (shouldBold) {
      wrapper.className += " bold-text";
    }

    const taskWeight =
      this.config.fontWeight || (shouldBold ? 500 : 400);
    wrapper.style.setProperty("--task-font-weight", taskWeight);

    if (this.config.colored) {
      wrapper.className += " colored";
    }

    if (this.config.titleColor) {
      wrapper.style.setProperty("--task-title-color", this.config.titleColor);
    }

    if (this.config.maxWidth) {
      wrapper.style.maxWidth =
        typeof this.config.maxWidth === "number"
          ? this.config.maxWidth + "px"
          : this.config.maxWidth;
    }

    if (!this.tasks) {
      wrapper.innerHTML = this.loaded ? "EMPTY" : "LOADING";
      wrapper.className = "container " + this.config.tableClass + " dimmed";
      return wrapper;
    }

    // Sort attributes like they are shown in the Tasks app
    switch (this.config.ordering) {
      case "myorder":
        let temp = [];
        this.tasks
          .filter((task) => task.parent === undefined) // Filter tasks to only parent tasks
          .sort((a, b) => (a.position > b.position ? 1 : -1)) // Sort parent tasks by position
          .forEach((task) => {
            // Map over parents to create reordered list of tasks
            temp.push(task);

            // Loop through all tasks to find and sort subtasks for each parent
            let subList = [];
            this.tasks.map((subtask) => {
              if (subtask.parent === task.id) {
                subList.push(subtask);
              }
            });
            subList.sort((a, b) => (a.position > b.position ? 1 : -1));
            temp.push(...subList);
          });
        this.tasks = temp;
        break;

      case "due":
      case "title":
      case "updated":
        this.tasks = this.tasks.sort((a, b) =>
          a[this.config.ordering] > b[this.config.ordering] ? 1 : -1
        );
        break;
    }

    let titleWrapper, dateWrapper, noteWrapper;

    let tasksToDisplay = this.tasks;
    if (this.tasks.length > this.config.maxResults) {
      tasksToDisplay = this.tasks.slice(0, this.config.maxResults);
    }

    tasksToDisplay.forEach((item, index) => {
      titleWrapper = document.createElement("div");
      titleWrapper.className = "item title";
      titleWrapper.innerHTML =
        '<i class="fa fa-circle-thin" ></i>' + item.title;

      // If item is completed change icon to checkmark
      if (item.status === "completed") {
        titleWrapper.innerHTML = '<i class="fa fa-check" ></i>' + item.title;
      }

      if (item.parent) {
        titleWrapper.className = "item child";
      }

      if (this.config.colorTasks && this.config.taskColors && this.config.taskColors.length > 0) {
        const color = this.config.taskColors[index % this.config.taskColors.length];
        titleWrapper.style.color = color;
      }

      if (item.notes) {
        noteWrapper = document.createElement("div");
        noteWrapper.className = "item notes light";
        noteWrapper.innerHTML = item.notes.replace(/\n/g, "<br>");
        titleWrapper.appendChild(noteWrapper);
      }

      dateWrapper = document.createElement("div");
      dateWrapper.className = "item date light";

      if (item.due) {
        let date = moment(item.due);
        dateWrapper.innerHTML = date.utc().format(this.config.dateFormat);
      }

      // Create borders between parent items
      if (index < tasksToDisplay.length - 1 && !tasksToDisplay[index + 1].parent) {
        titleWrapper.className += " border";
        dateWrapper.className += " border";
      }

      wrapper.appendChild(titleWrapper);
      wrapper.appendChild(dateWrapper);
    });

    if (this.config.showMoreIndicator && this.tasks.length > this.config.maxResults) {
      let extraTasks = this.tasks.length - tasksToDisplay.length;
      let extraStr = extraTasks + (this.nextPageToken ? "+" : "");
      let totalStr = this.tasks.length + (this.nextPageToken ? "+" : "");

      let moreWrapper = document.createElement("div");
      moreWrapper.className = "more-indicator light dimmed";
      let text = this.config.moreIndicatorFormat || "+{extra} more tasks";
      text = text
        .replace("{extra}", extraStr)
        .replace("{total}", totalStr)
        .replace("{displayed}", tasksToDisplay.length);
      moreWrapper.innerHTML = text;
      wrapper.appendChild(moreWrapper);
    }

    return wrapper;
  }
});
