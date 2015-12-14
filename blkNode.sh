#!/bin/bash
#echo "########### The server will reboot when the script is complete"
echo "########### Changing to home dir"
cd ~
#echo "########### Change your root password!"
#passwd
# echo "########### Firewall rules; allow 22,80,15714"
# ufw allow 22/tcp
# ufw allow 80/tcp
# ufw allow 15714/tcp
# ufw allow 15715/tcp
# ufw allow 30000/tcp
# ufw --force enable
echo "########### Creating Swap"
dd if=/dev/zero of=/swapfile bs=1M count=1024 ; mkswap /swapfile ; swapon /swapfile
echo "/swapfile swap swap defaults 0 0" >> /etc/fstab
#reboot
echo "########### Updating Ubuntu"
codename=`lsb_release -c | sed 's/Codename:\t//g'`
apt-get update -y
apt-get upgrade -y
apt-get dist-upgrade -y
echo "########### Installing dev build utils and libs"
#apt-get install git htop software-properties-common python-software-properties build-essential libssl-dev libdb++-dev libboost-all-dev libqrencode-dev -y
apt-get install git htop software-properties-common python-software-properties build-essential libssl-dev libdb++-dev libboost1.48-all-dev libqrencode-dev -y
echo "########### Installing keys and repos"
#sudo apt-key adv --keyserver hkp://subkeys.pgp.net --recv-keys 548C16BF
echo deb http://apt.newrelic.com/debian/ newrelic non-free > /etc/apt/sources.list.d/newrelic.list
# wget -O /tmp/nginx_signing.key http://nginx.org/keys/nginx_signing.key
wget -O- https://download.newrelic.com/548C16BF.gpg | apt-key add -
# apt-key add /tmp/nginx_signing.key
# echo "deb http://nginx.org/packages/mainline/ubuntu/ ${codename} nginx
# deb-src http://nginx.org/packages/mainline/ubuntu/ ${codename} nginx" | tee /etc/apt/sources.list.d/nginx.list
add-apt-repository -y ppa:chris-lea/node.js
apt-get update -y
# echo "########### Installing nginx and nodejs"
# apt-get install nginx nodejs -y
apt-get install nodejs newrelic-sysmond -y
npm i grunt-cli forever -g
#echo "########### Adding ppa:bitcoin/bitcoin and installing bitcoind"
#add-apt-repository -y ppa:bitcoin/bitcoin
#apt-get update -y
nrsysmond-config --set license_key=${new_relic_license_key}
/etc/init.d/newrelic-sysmond start
echo "########### Cloning and installing blackcoind"
git clone https://github.com/rat4/blackcoin.git
cd blackcoin/src
make -f makefile.unix USE_UPNP= && strip blackcoind && cp blackcoind /usr/bin/
#apt-get install bitcoind -y
echo "########### Creating config"
cd ~
mkdir .blackcoin
config=".blackcoin/blackcoin.conf"
touch $config
echo "server=1" > $config
echo "daemon=1" >> $config
echo "connections=20" >> $config
#randUser=`< /dev/urandom tr -dc A-Za-z0-9 | head -c30`
#randPass=`< /dev/urandom tr -dc A-Za-z0-9 | head -c30`
echo "rpcallowip=127.0.0.1" >> $config
echo "rpcuser=blackcoinrpc" >> $config
echo "rpcpassword=password" >> $config
echo "########### Setting up autostart (cron)"
cp insight_forever.sh /root/
crontab -l > tempcron
echo "@reboot blackcoind" >> tempcron
echo "@reboot /root/insight_forever.sh" >> tempcron
crontab tempcron
rm tempcron
reboot
