#!/bin/sh
# Creates a Docker network named 'internalWebsides'.
# Default: macvlan driver with VLAN 160. Set PARENT_IFACE to your host interface (e.g. eth0).

set -e

PARENT_IFACE=${PARENT_IFACE:-eth0}
NETWORK_NAME=internalWebsides
VLAN_ID=${VLAN_ID:-160}
SUBNET=${SUBNET:-192.168.160.0/24}
GATEWAY=${GATEWAY:-192.168.160.1}

echo "Creating macvlan network '$NETWORK_NAME' on parent '$PARENT_IFACE' with VLAN $VLAN_ID"

# Check if network already exists
if docker network ls --format '{{.Name}}' | grep -x "$NETWORK_NAME" >/dev/null 2>&1; then
  echo "Network $NETWORK_NAME already exists - skipping creation"
  exit 0
fi

# macvlan example - requires that the host supports macvlan and the parent interface exists
# Adjust subnet/gateway to match your environment; using placeholders by default.

docker network create -d macvlan \
  --subnet="$SUBNET" \
  --gateway="$GATEWAY" \
  -o parent="$PARENT_IFACE.$VLAN_ID" \
  --label vlan="$VLAN_ID" \
  $NETWORK_NAME || {
    echo "macvlan creation failed, attempting simple bridge network as fallback"
    docker network create --driver bridge $NETWORK_NAME
}

echo "Done. If you used macvlan, ensure the parent interface name is correct (PARENT_IFACE)."

echo "Example run (custom interface):"
echo "  PARENT_IFACE=eth0 VLAN_ID=160 SUBNET=192.168.160.0/24 GATEWAY=192.168.160.1 ./scripts/create_internalWebsides_network.sh"
