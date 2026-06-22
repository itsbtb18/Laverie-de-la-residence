# ---- Stage 1: build the React/Vite frontend ----
FROM node:20-slim AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Stage 2: Django backend serving the built SPA ----
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
# Bring in the compiled frontend from stage 1.
COPY --from=frontend /app/dist ./dist

# Collect Django/admin static files (SECRET_KEY just needs to exist for this).
RUN SECRET_KEY=build-time-dummy python manage.py collectstatic --noinput

CMD python manage.py migrate --noinput && \
    gunicorn core_backend.wsgi --bind 0.0.0.0:$PORT --workers 3
