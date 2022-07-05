(async () => {
  // Fetching UI configuration from the server.
  const UI_CONFIG_URL = "/.ui_config";
  const UI_CONFIG = await (await fetch(UI_CONFIG_URL)).json();
  const SERVER_WEBSOCKET_PORT = UI_CONFIG.websocketPort;

  // How many seconds wait before open cards on REVEAL message.
  const OPEN_DELAY = 3;

  // If URL doesn't contain a session id - generate a new one then redirect.
  const SESSION_ID = window.location.pathname;
  if (SESSION_ID === "/" || SESSION_ID === "") {
    let newSessionId = uuidv4();
    window.location.href = `${window.location.origin}/${newSessionId}`;
  }

  MESSAGE_TYPE = {
    STATE_REQUEST: "state_request",
    STATE: "state",
    REGISTER: "register",
    REVEAL_CARDS: "reveal_cards",
    RENEW_GAME: "renew_game",
  };

  function uuidv4() {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
      (
        c ^
        (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
      ).toString(16)
    );
  }

  /**
   * Generate random variants for the cards.
   *
   * @returns List of variants.
   */
  function randomVariants() {
    let variants = [];
    const ranges = [1, 2, 4, 7, 12, 22, 39, 72, 131, 240];
    const zip = (rows) => rows[0].map((_, c) => rows.map((row) => row[c]));
    const randomInt = (lowerBound, upperBound) =>
      Math.ceil(Math.random() * (upperBound - lowerBound) + lowerBound);
    bounds = zip([ranges.slice(1), ranges]);
    let lb, ub;
    for (let bound of bounds) {
      [ub, lb] = bound;
      variants.push(randomInt(ub, lb));
    }

    return variants;
  }

  const App = {
    data() {
      return {
        cards: [],
        counter: 0,
        isCardsOpen: false,
        openDelayCounter: 0,
        playerId: "",
        playerName: "",
        variants: [...randomVariants(), "?"],
        vote: null,
      };
    },
    mounted() {
      let playerName = localStorage.getItem("playerName");
      let playerId = localStorage.getItem("playerId");

      if (!playerId) {
        playerId = uuidv4();
        localStorage.setItem("playerId", playerId);
      }

      if (!playerName) {
        playerName = "Harry potter";
        let newName = prompt("Enter your name", playerName);
        if (newName) {
          playerName = newName;
        }
        localStorage.setItem("playerName", playerName);
      }

      this.playerName = playerName;
      this.playerId = playerId;

      this.cards = [
        {
          playerName: this.playerName,
          playerId: this.playerId,
          bid: null,
        },
      ];

      this.socket = new WebSocket(
        `ws://${window.location.hostname}:${SERVER_WEBSOCKET_PORT}`
      );

      this.socket.addEventListener("error", (event) => {
        console.error("WebSocket error", event);
      });

      this.socket.addEventListener("open", (event) => {
        let msg = JSON.stringify({
          sessionId: SESSION_ID,
          type: MESSAGE_TYPE.REGISTER,
          playerName: this.playerName,
          playerId: this.playerId,
          vote: this.vote,
        });
        this.socket.send(msg);
        console.log("<-- send message", msg);

        msg = JSON.stringify({
          sessionId: SESSION_ID,
          type: MESSAGE_TYPE.STATE_REQUEST,
        });
        this.socket.send(msg);
        console.log(msg);
      });

      this.socket.addEventListener("message", (messageEvent) => {
        console.log("--> get message", messageEvent.data);
        let message = JSON.parse(messageEvent.data);
        if (message.type === MESSAGE_TYPE.STATE_REQUEST) {
          this.socket.send(
            JSON.stringify({
              sessionId: SESSION_ID,
              type: MESSAGE_TYPE.STATE,
              playerId: this.playerId,
              playerName: this.playerName,
              vote: this.vote,
            })
          );
        }

        if (
          [MESSAGE_TYPE.STATE, MESSAGE_TYPE.REGISTER].includes(message.type)
        ) {
          let found = false;
          this.cards.forEach((card) => {
            if (card.playerId === message.playerId) {
              card.playerName = message.playerName;
              card.bid = message.vote;
              found = true;
            }
          });
          if (!found) {
            this.cards.push({
              playerName: message.playerName,
              playerId: message.playerId,
              bid: message.vote,
            });
          }
        }

        // If REVEAL message was gotten - open cards after
        // OPEN_DELAY interval.
        if (message.type === MESSAGE_TYPE.REVEAL_CARDS) {
          this.openDelayCounter = OPEN_DELAY;
          let openDelayInterval = setInterval(() => {
            this.openDelayCounter--;

            if (this.openDelayCounter === 0) {
              this.isCardsOpen = true;
              clearInterval(openDelayInterval);
            }
          }, 1000);
        }

        if (message.type === MESSAGE_TYPE.RENEW_GAME) {
          this.isCardsOpen = false;
          this.vote = null;
          this.cards.splice(1, this.cards.length);
          this.cards[0].bid = null;

          this.socket.send(
            JSON.stringify({
              sessionId: SESSION_ID,
              type: MESSAGE_TYPE.STATE,
              playerName: this.playerName,
              playerId: this.playerId,
              vote: this.vote,
            })
          );
        }
      });
    },

    methods: {
      onVote(vote) {
        this.vote = vote;
        this.socket.send(
          JSON.stringify({
            sessionId: SESSION_ID,
            type: MESSAGE_TYPE.STATE,
            playerName: this.playerName,
            playerId: this.playerId,
            vote: this.vote,
          })
        );
      },

      onRename() {
        let newName = prompt("Enter your name", this.playerName);
        if (newName) {
          this.playerName = newName;
        }

        localStorage.setItem("playerName", this.playerName);

        this.socket.send(
          JSON.stringify({
            sessionId: SESSION_ID,
            type: MESSAGE_TYPE.STATE,
            playerName: this.playerName,
            playerId: this.playerId,
            vote: this.vote,
          })
        );
      },

      onRevealCards() {
        this.socket.send(
          JSON.stringify({
            sessionId: SESSION_ID,
            type: MESSAGE_TYPE.REVEAL_CARDS,
          })
        );
      },

      onStartNewVoting() {
        this.socket.send(
          JSON.stringify({
            sessionId: SESSION_ID,
            type: MESSAGE_TYPE.RENEW_GAME,
          })
        );
      },

      averageScore() {
        let score = 0;
        let count = 0;
        for (let idx in this.cards) {
          if (typeof this.cards[idx].bid === "number") {
            score += this.cards[idx].bid;
            count++;
          }
        }

        return count ? score / count : 0;
      },
    },
  };

  Vue.createApp(App).mount("#app");
})();
