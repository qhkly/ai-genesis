ARG BASE_IMAGE=ai-genesis-base:latest
FROM ${BASE_IMAGE}

LABEL org.opencontainers.image.title="ai-genesis" \
      org.opencontainers.image.description="Persistent AI brain with memory, tasks, and autonomous synthesis" \
      org.opencontainers.image.source="https://github.com/qhkly/ai-genesis"

ENV DATA_DIR=/data \
    BRAIN_CONFIG_PATH=/opt/ai-genesis/brain-config.json \
    KNOWLEDGE_DIR=/data/knowledge \
    THINK_SCRIPT=/opt/scripts/think.sh \
    PORT=8080

WORKDIR /opt/ai-genesis

COPY brain-api/package.json /opt/ai-genesis/brain-api/package.json
RUN cd /opt/ai-genesis/brain-api \
    && npm install --omit=dev \
    && npm cache clean --force

COPY brain-api/server.js /opt/ai-genesis/brain-api/server.js
COPY brain-config.json /opt/ai-genesis/brain-config.json
COPY knowledge /opt/ai-genesis/knowledge
COPY configs/supervisord.conf /etc/supervisor/supervisord.conf
COPY configs/supervisor-brain-api.conf /etc/supervisor/conf.d/supervisor-brain-api.conf
COPY configs/crontab /etc/cron.d/ai-genesis
COPY scripts /opt/scripts

RUN chmod 0644 /etc/cron.d/ai-genesis \
    && crontab -u ubuntu /etc/cron.d/ai-genesis \
    && chmod +x /opt/scripts/*.sh \
    && mkdir -p /data /data/knowledge \
    && chown -R ubuntu:ubuntu /data /opt/ai-genesis /opt/scripts

EXPOSE 8080

ENTRYPOINT ["/opt/scripts/startup.sh"]
