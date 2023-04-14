FROM debian:bullseye
RUN apt update && apt install -y \
  python2 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /home/work/jade
COPY . . 
CMD python2 server.py
