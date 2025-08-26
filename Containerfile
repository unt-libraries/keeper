FROM docker.io/python:3.11-slim-bullseye

# set environment variables
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# create directories
RUN mkdir -p /app/keeper
RUN mkdir /app/private-media
RUN mkdir /app/postgres_data
WORKDIR /app/keeper

# install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    python3-dev \
    build-essential \
    libpq-dev \
    netcat \
    libmagic-dev

# install python dependencies
COPY requirements/ /app/keeper/requirements/
RUN pip install --upgrade pip && pip install -r requirements/dev.txt --use-pep517

# copy entrypoint.sh
COPY ./entrypoint.sh .
RUN sed -i 's/\r$//g' /app/keeper/entrypoint.sh
RUN chmod +x /app/keeper/entrypoint.sh

# copy project
COPY . .

# run entrypoint.sh
ENTRYPOINT ["/app/keeper/entrypoint.sh"]
