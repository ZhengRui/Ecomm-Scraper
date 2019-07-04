FROM ubuntu:16.04

ENV NVM_DIR=/usr/local/nvm \
    NODE_VERSION=8.15.0

RUN rm /bin/sh \
    && ln -s /bin/bash /bin/sh

RUN apt update && apt install -y curl wget make g++ python xvfb \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list \
    && apt update && apt install -y google-chrome-stable && apt-get clean \
    && mkdir -p /usr/local/nvm \
    && curl --silent -o- https://raw.githubusercontent.com/creationix/nvm/v0.34.0/install.sh | bash \
    && source $NVM_DIR/nvm.sh \
    && nvm install $NODE_VERSION \
    && nvm alias default $NODE_VERSION \
    && nvm use default \
    && node -v \
    && npm -v \
    && npm install -g yarn

ENV NODE_PATH=$NVM_DIR/v$NODE_VERSION/lib/node_modules \
    PATH=$NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

COPY . /scraper/
WORKDIR /scraper
# RUN yarn install

# ENV SOURCE wayfair
# RUN xvfb-run --server-args="-screen 0 1024x768x24" node index.js
