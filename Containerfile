FROM docker.io/python:3.9-slim-bullseye

# set environment variables
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# create and set working directory
RUN mkdir /keeper
WORKDIR /keeper

# install system dependencies
RUN apt-get update && apt-get install -y \
    python3-dev \
    build-essential \
    libpq-dev \
    netcat \
    libmagic-dev

# install python dependencies
COPY requirements/ /keeper/requirements/
RUN pip install --upgrade pip && pip install -r requirements/dev.txt

# copy entrypoint.sh
COPY ./entrypoint.sh .
RUN sed -i 's/\r$//g' /keeper/entrypoint.sh
RUN chmod +x /keeper/entrypoint.sh

# copy project
COPY . .

# run entrypoint.sh
ENTRYPOINT ["/keeper/entrypoint.sh"]
