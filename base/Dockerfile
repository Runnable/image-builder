FROM node:0.10

RUN apt-get update && \
    apt-get install -y apt-transport-https && \
    apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 36A1D7869245C8950F966E92D8576A8BA88D21E9 && \
    echo deb https://get.docker.io/ubuntu docker main > /etc/apt/sources.list.d/docker.list && \
    apt-get update && \
    apt-get install -y lxc-docker-1.6.2 && \
    rm -rf /var/lib/apt/lists/*
