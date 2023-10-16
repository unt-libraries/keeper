# Makefile for keeperpod setup

create-pod:
	@echo "Creating keeperpod..."
	@podman pod create --name keeperpod --userns=keep-id -p 1337:8443 -p 8000:8000

create-dirs:
	@echo "Creating directories..."
	@mkdir -p ../postgres_data
	@mkdir -p ../private-media

create-db:
	@echo "Creating keeper_db container..."
	@podman create --pod keeperpod \
		--name keeper_db \
		-v ../postgres_data:/var/lib/postgresql/data \
		-v /etc/passwd:/etc/passwd:ro \
		--env-file .env \
		docker.io/postgres:15.4

build-web:
	@echo "Building keeper_web_prod image..."
	podman build -t keeper_web_prod -f Containerfile.prod .

create-web:
	@echo "Creating keeper_web container..."
	@podman create --pod keeperpod \
		--name keeper_web \
		-v static_volume:/app/keeper/static:z \
		-v ../private-media:/app/keeper/private-media:z \
		--env-file .env \
		--requires keeper_db \
		keeper_web_prod uwsgi --ini uwsgi.ini --env DJANGO_SETTINGS_MODULE=tests.settings.production

build-nginx:
	@echo "Building keeper_nginx_prod image..."
	@podman build -t keeper_nginx_prod -f ./nginx/Containerfile ./nginx

create-nginx:
	@echo "Creating keeper_nginx container..."
	@podman create --pod keeperpod \
		--name keeper_nginx \
		-v static_volume:/app/keeper/static:z \
		-v ../private-media:/app/keeper/private-media:z \
		-v ../ssl_certs/privkey.pem:/etc/nginx/ssl/privkey.pem \
		-v ../ssl_certs/fullchain.pem:/etc/nginx/ssl/fullchain.pem \
		--requires keeper_web,keeper_db \
		keeper_nginx_prod

start-pod:
	@echo "Starting keeperpod..."
	@podman pod start keeperpod

migrate:
	@echo "Running migrations..."
	@podman exec keeper_web python manage.py migrate --noinput

collect-static:
	@echo "Collecting static files..."
	@podman exec keeper_web python manage.py collectstatic --noinput

create-user:
	@echo "Creating superuser..."
	@podman exec -it keeper_web python manage.py createsuperuser

build-all: create-pod create-dirs create-db build-web create-web build-nginx create-nginx start-pod migrate collect-static
	@echo "All tasks completed successfully!"

stop:
	@echo "Stopping keeperpod..."
	@podman pod stop keeperpod

remove:
	@echo "Removing keeperpod..."
	@podman pod rm keeperpod

prune-all:
	@echo "Pruning all podman stuff..."
	@podman system prune --all --volumes
